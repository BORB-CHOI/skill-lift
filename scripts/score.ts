/**
 * 본 실행 결과를 판정하고 리포트를 쓴다.
 * 에이전트를 다시 실행하지 않고 채점도 하지 않는다. 실행 폴더의 meta.json과 grade.json을 읽기만 한다.
 *
 * 분석 단위는 실행이다. (프로젝트, 모델)마다 skill을 baseline, placebo와 각각 비교한다(가설 8개).
 * 차이는 두 표본 순열 검정, 동등은 ±δ TOST, 구간은 순열 검정 역산이고, Holm 보정은 차이 p값
 * 8개와 동등 p값 8개에 따로 적용한다.
 *
 * 사용: pnpm tsx scripts/score.ts <실행 이름> <사전 등록 JSON>
 * 출력: results/es-toolkit-migrate-project/<실행 이름>/report.md
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ARMS,
  armScores,
  cellRuns,
  itemPassRates,
  manipulationFlags,
  RUN_STATES,
  runCost,
  runDurationMs,
  runModel,
  runScore,
  runTurnCount,
  summarize,
  type Arm,
  type ItemPassRate,
  type RunRecord,
} from '../src/stats/aggregate.js';
import {
  conclude,
  conclusionSentence,
  decideHypotheses,
  hypothesisFamily,
  modelLabel,
  verdictSentence,
  type HypothesisResult,
} from '../src/stats/decision.js';
import type { Interval } from '../src/stats/intervals.js';
import { loadRuns } from '../src/stats/load-runs.js';
import { mean } from '../src/stats/paired.js';
import { EXACT_LIMIT, MC_DRAWS, permutationInterval } from '../src/stats/permutation.js';
import { parsePreregistration } from '../src/stats/prereg.js';

const [label = '', preregPath = ''] = process.argv.slice(2);
if (label === '' || preregPath === '') {
  throw new Error('사용: tsx scripts/score.ts <실행 이름> <사전 등록 JSON>');
}

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const outRoot = join(repoRoot, 'results/es-toolkit-migrate-project', label);
const prereg = parsePreregistration(JSON.parse(readFileSync(preregPath, 'utf8')));
const runs = loadRuns(outRoot);
const { alpha, delta } = prereg;

const lines: string[] = [];
const out = (line = ''): void => {
  lines.push(line);
};
const pct = (x: number | null): string => (x === null ? '-' : `${(x * 100).toFixed(1)}%`);
const pp = (x: number | null): string => {
  if (x === null) return '-';
  if (!Number.isFinite(x)) return x > 0 ? '+∞' : '−∞';
  return `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}pp`;
};
const interval = (i: Interval | null): string =>
  i === null ? '-' : `[${pp(i.lower)}, ${pp(i.upper)}]`;
const pv = (p: number): string => (p < 0.0001 ? '<0.0001' : p.toFixed(4));
const num = (v: number | null, digits: number): string => (v === null ? '-' : v.toFixed(digits));
const avg = (values: readonly number[]): number | null =>
  values.length === 0 ? null : mean(values);
const rate = (hits: number, total: number): string =>
  total === 0 ? '-' : `${hits}/${total} (${pct(hits / total)})`;

interface Cell {
  readonly project: string;
  readonly model: string;
  readonly runs: readonly RunRecord[];
  readonly scores: Readonly<Record<Arm, number[]>>;
}

const cells: Cell[] = prereg.projects.flatMap((project) =>
  prereg.models.map((model) => {
    const own = cellRuns(runs, project, model);
    const scores = {
      baseline: armScores(own, 'baseline'),
      skill: armScores(own, 'skill'),
      placebo: armScores(own, 'placebo'),
    };
    return { project, model, runs: own, scores };
  }),
);
const cellOf = (project: string, model: string): Cell | undefined =>
  cells.find((c) => c.project === project && c.model === model);
const cellName = (c: { project: string; model: string }): string =>
  `${c.project} · ${modelLabel(c.model)}`;

// 1. 판정
const family = hypothesisFamily(prereg.projects, prereg.models);
const samples = family.map((spec) => {
  const scores = cellOf(spec.project, spec.model)?.scores;
  return { spec, treatment: scores?.skill ?? [], control: scores?.[spec.control] ?? [] };
});
const results = decideHypotheses(samples, { alpha, delta });
const intervals = samples.map((s) =>
  s.treatment.length === 0 || s.control.length === 0
    ? null
    : permutationInterval(s.treatment, s.control, alpha, { tolerance: 1e-4 }),
);
const resultFor = (project: string, model: string, control: 'baseline' | 'placebo') => {
  const index = results.findIndex(
    (r) => r.spec.project === project && r.spec.model === model && r.spec.control === control,
  );
  return { result: results[index] as HypothesisResult, interval: intervals[index] ?? null };
};

const VERDICT_LABEL = {
  higher: '높음',
  lower: '낮음',
  equivalent: '동등',
  inconclusive: '판정 불가',
};
const inScope = new Set(cells.flatMap((c) => c.runs.map((r) => r.meta.runId)));
const outOfScope = runs.filter((r) => !inScope.has(r.meta.runId));
const missingGrades = runs.filter((r) => r.meta.state === 'completed' && r.grade === null);

out(`# es-toolkit 전환 평가 결과: ${label}`);
out();
out(
  `실행 ${runs.length}개. 프로젝트 ${prereg.projects.join(', ')} × 모델 ${prereg.models.map(modelLabel).join(', ')}, 가설 ${family.length}개. α = ${alpha}, δ = ±${(delta * 100).toFixed(0)}pp, 사전 등록 K = ${prereg.k}.`,
);
if (missingGrades.length > 0) {
  out();
  out(
    `> grade.json이 없는 정상 종료 실행이 ${missingGrades.length}개다. 채점기를 먼저 돌려야 한다. 이 실행들은 결측으로 처리했다: ${missingGrades.map((r) => r.meta.runId).join(', ')}`,
  );
}
if (outOfScope.length > 0) {
  out();
  out(
    `> 사전 등록한 프로젝트·모델에 속하지 않는 실행 ${outOfScope.length}개는 분석에서 뺐다: ${outOfScope.map((r) => `${r.meta.runId}(${r.meta.taskId}, ${runModel(r.meta) ?? '모델 기록 없음'})`).join(', ')}`,
  );
}

out();
out('## 1. 조건별 실행 점수');
out();
out(
  '실행 점수는 통과한 채점 항목의 비율이다. 시간·턴 한도로 끝난 실행은 0점으로 넣고, 오염·인프라 실패·하네스 결함·채점 없음 실행은 뺀다.',
);
out();
out('| 프로젝트 | 모델 | 조건 | 분석 실행 | 평균 | 표준편차 |');
out('|---|---|---|---|---|---|');
for (const cell of cells) {
  for (const arm of ARMS) {
    const s = summarize(cell.scores[arm]);
    out(
      `| ${cell.project} | ${modelLabel(cell.model)} | ${arm} | ${s.n} | ${pct(s.mean)} | ${pct(s.sd)} |`,
    );
  }
}

out();
out('## 2. 가설별 판정');
out();
out(
  `차이는 skill 평균 − 대조 평균이다. p값은 두 표본 순열 검정이다. 배치 수 C(n1 + n2, n1)가 ${EXACT_LIMIT.toLocaleString('en-US')} 이하면 모든 배치를 세고, 넘으면 시드를 고정한 무작위 배치 ${MC_DRAWS.toLocaleString('en-US')}개로 계산한다. 동등 p는 처리 표본을 ±δ 옮긴 두 단측 순열 검정 중 큰 값이다. 95% 구간은 순열 검정을 뒤집어 구했고 Holm 보정 전 값이다. Holm 보정은 차이 검정 ${family.length}개와 동등 검정 ${family.length}개에 따로 적용했다.`,
);
out();
out(
  '| 프로젝트 | 모델 | 대조 | skill 실행 | 대조 실행 | 평균 차이 | 95% 구간 | 계산 | 차이 p | Holm 조정 p | 동등 p | Holm 조정 동등 p | 판정 |',
);
out('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
results.forEach((r, i) => {
  const s = samples[i];
  const method = r.method === null ? '-' : r.method === 'exact' ? '정확' : '몬테카를로';
  out(
    `| ${r.spec.project} | ${modelLabel(r.spec.model)} | ${r.spec.control} | ${s?.treatment.length ?? 0} | ${s?.control.length ?? 0} | ${pp(r.meanDifference)} | ${interval(intervals[i] ?? null)} | ${method} | ${pv(r.pDifference)} | ${pv(r.pDifferenceAdjusted)} | ${pv(r.pEquivalence)} | ${pv(r.pEquivalenceAdjusted)} | **${VERDICT_LABEL[r.verdict]}** |`,
  );
});

// 3. 결론
const stateCount = (own: readonly RunRecord[], arm: Arm) => {
  const all = own.filter((r) => r.meta.arm === arm);
  const byState = Object.fromEntries(
    RUN_STATES.map((s) => [s, all.filter((r) => r.meta.state === s).length]),
  ) as Record<(typeof RUN_STATES)[number], number>;
  const ungraded = all.filter((r) => r.meta.state === 'completed' && r.grade === null).length;
  return {
    total: all.length,
    byState,
    ungraded,
    contaminatedShare: all.length === 0 ? 0 : byState.contaminated / all.length,
  };
};

out();
out('## 3. 판정 문장과 결론');
for (const cell of cells) {
  const vsBaseline = resultFor(cell.project, cell.model, 'baseline');
  const vsPlacebo = resultFor(cell.project, cell.model, 'placebo');
  const conclusion = conclude(vsBaseline.result.verdict, vsPlacebo.result.verdict);
  out();
  out(`### ${cellName(cell)}`);
  out();
  for (const h of [vsBaseline, vsPlacebo]) {
    out(`- ${verdictSentence(h.result.spec, h.result.verdict, delta)}`);
  }
  out();
  out(`**결론:** ${conclusionSentence(cell.project, cell.model, conclusion, delta)}`);
  if (conclusion === 'undetermined') {
    out();
    out(`baseline 대비 평균 차이의 95% 구간(순열 검정 역산): ${interval(vsBaseline.interval)}`);
  }
  const over = ARMS.map((arm) => ({ arm, ...stateCount(cell.runs, arm) })).filter(
    (a) => a.contaminatedShare > 0.05,
  );
  if (over.length > 0) {
    out();
    out(
      `**한계:** 오염 실행 비율이 5%를 넘은 조건이 있다 (${over.map((a) => `${a.arm} ${pct(a.contaminatedShare)}`).join(', ')}). 오염 실행은 분석에서 뺐다.`,
    );
  }
}

// 4. 항목별 통과율
out();
out('## 4. 항목별 통과율');
out();
out(
  '1절과 같은 실행을 쓴다. 한도 실행은 모든 항목을 실패로 센다. 조건 사이 차이가 큰 항목부터 적었다.',
);
const passShare = (r: ItemPassRate | undefined): number | null =>
  r === undefined || r.runs === 0 ? null : r.passed / r.runs;
const diff = (a: number | null, b: number | null): number | null =>
  a === null || b === null ? null : a - b;
for (const cell of cells) {
  const byArm = Object.fromEntries(
    ARMS.map((arm) => [arm, itemPassRates(cell.runs, arm)]),
  ) as Record<Arm, ItemPassRate[]>;
  const rows = byArm.skill.map((skillRow) => {
    const find = (arm: Arm) => byArm[arm].find((r) => r.id === skillRow.id);
    const s = passShare(skillRow);
    const vsBaseline = diff(s, passShare(find('baseline')));
    const vsPlacebo = diff(s, passShare(find('placebo')));
    return { skillRow, find, vsBaseline, vsPlacebo };
  });
  rows.sort(
    (a, b) =>
      Math.max(Math.abs(b.vsBaseline ?? 0), Math.abs(b.vsPlacebo ?? 0)) -
      Math.max(Math.abs(a.vsBaseline ?? 0), Math.abs(a.vsPlacebo ?? 0)),
  );
  out();
  out(`### ${cellName(cell)}`);
  out();
  if (rows.length === 0) {
    out('grade.json이 없어 항목을 집계하지 못했다.');
    continue;
  }
  out('| 항목 | 종류 | baseline | skill | placebo | skill − baseline | skill − placebo |');
  out('|---|---|---|---|---|---|---|');
  for (const { skillRow, find, vsBaseline, vsPlacebo } of rows) {
    const cellText = (arm: Arm): string => {
      const r = find(arm);
      return r === undefined ? '-' : rate(r.passed, r.runs);
    };
    out(
      `| ${skillRow.id} | ${skillRow.kind} | ${cellText('baseline')} | ${cellText('skill')} | ${cellText('placebo')} | ${pp(vsBaseline)} | ${pp(vsPlacebo)} |`,
    );
  }
}

// 5. 실행 상태
out();
out('## 5. 실행 상태');
out();
out(
  '| 프로젝트 | 모델 | 조건 | 실행 | 정상 종료 | 한도 | 인프라 실패 | 하네스 결함 | 오염 | 오염 비율 | 채점 없음 |',
);
out('|---|---|---|---|---|---|---|---|---|---|---|');
for (const cell of cells) {
  for (const arm of ARMS) {
    const a = stateCount(cell.runs, arm);
    out(
      `| ${cell.project} | ${modelLabel(cell.model)} | ${arm} | ${a.total} | ${a.byState.completed} | ${a.byState.limit} | ${a.byState.infra} | ${a.byState.harness} | ${a.byState.contaminated} | ${pct(a.contaminatedShare)}${a.contaminatedShare > 0.05 ? ' **5% 초과**' : ''} | ${a.ungraded} |`,
    );
  }
}

// 6. 조작 확인
const manipulationKeys = [
  ...new Set(runs.flatMap((r) => Object.keys(manipulationFlags(r.meta)))),
].sort();
out();
out('## 6. 조작 확인');
out();
out(
  '정상 종료와 한도 실행 가운데 해당 행동을 한 비율이다. 그 값을 기록하지 않은 실행은 분모에서 뺀다.',
);
out();
out(`| 프로젝트 | 모델 | 조건 | Skill 로드 | 외부 접근 시도 | ${manipulationKeys.join(' | ')} |`);
out(`|---|---|---|---|---|${manipulationKeys.map(() => '---|').join('')}`);
for (const cell of cells) {
  for (const arm of ARMS) {
    const own = cell.runs.filter(
      (r) => r.meta.arm === arm && (r.meta.state === 'completed' || r.meta.state === 'limit'),
    );
    const share = (pick: (r: RunRecord) => boolean | undefined): string => {
      const known = own.map(pick).filter((v): v is boolean => v !== undefined);
      return rate(known.filter((v) => v).length, known.length);
    };
    const flags = manipulationKeys.map((key) => share((r) => manipulationFlags(r.meta)[key]));
    const loaded = share((r) =>
      r.meta.loadedSkills === undefined ? undefined : r.meta.loadedSkills.length > 0,
    );
    const network = share((r) =>
      r.meta.networkAttempts === undefined ? undefined : r.meta.networkAttempts.length > 0,
    );
    out(
      `| ${cell.project} | ${modelLabel(cell.model)} | ${arm} | ${loaded} | ${network} | ${flags.join(' | ')} |`,
    );
  }
}

// 7. 비용·시간·턴
out();
out('## 7. 비용·시간·턴 (판정하지 않음)');
out();
out('오염 실행을 뺀 모든 실행의 두 턴 합이다. 단가는 사전 등록의 모델별 값(1M 토큰당 USD)이다.');
out();
out('| 프로젝트 | 모델 | 조건 | 평균 비용(USD) | 총 비용(USD) | 평균 시간(분) | 평균 턴 |');
out('|---|---|---|---|---|---|---|');
let grandTotal = 0;
for (const cell of cells) {
  const pricing = prereg.pricing[cell.model];
  for (const arm of ARMS) {
    const own = cell.runs.filter((r) => r.meta.arm === arm && r.meta.state !== 'contaminated');
    const costs =
      pricing === undefined
        ? []
        : own.map((r) => runCost(r.meta, pricing)).filter((v): v is number => v !== null);
    const total = costs.reduce((s, c) => s + c, 0);
    grandTotal += total;
    const minutes = own
      .map((r) => runDurationMs(r.meta))
      .filter((v): v is number => v !== null)
      .map((ms) => ms / 60_000);
    const turns = own.map((r) => runTurnCount(r.meta)).filter((v): v is number => v !== null);
    out(
      `| ${cell.project} | ${modelLabel(cell.model)} | ${arm} | ${num(avg(costs), 4)} | ${total.toFixed(2)} | ${num(avg(minutes), 1)} | ${num(avg(turns), 1)} |`,
    );
  }
}
out();
out(`분석 범위 실행의 총 비용: ${grandTotal.toFixed(2)} USD.`);

const analysed = runs.filter((r) => inScope.has(r.meta.runId) && runScore(r) !== null).length;
out(`판정에 쓴 실행: ${analysed}개.`);

writeFileSync(join(outRoot, 'report.md'), `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));
