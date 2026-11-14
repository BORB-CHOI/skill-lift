/**
 * 본 실행 결과를 판정하고 리포트를 쓴다 (설계 2절, 2.1절, 6절, 8절, 8.2절).
 * 에이전트를 다시 실행하지 않고 채점도 하지 않는다. 실행 폴더의 grade.json을 읽기만 한다.
 *
 * 사용: pnpm tsx scripts/score.ts <실행 이름> <사전 등록 JSON> [검증 반복 수=1000]
 * 출력: results/es-toolkit-migrate/<실행 이름>/report.md
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  manipulationFlags,
  p2ByType,
  pairTasks,
  runCost,
  runDurationMs,
  runTurnCount,
  runScore,
  type Arm,
  type PairedSet,
  type RunRecord,
  type RunStateName,
} from '../src/stats/aggregate.js';
import { bcaInterval } from '../src/stats/bootstrap.js';
import {
  conclude,
  conclusionSentence,
  decideHypotheses,
  HYPOTHESES,
  verdictSentence,
  type HypothesisId,
  type Purpose,
} from '../src/stats/decision.js';
import type { Interval } from '../src/stats/intervals.js';
import { signFlipInterval } from '../src/stats/inversion.js';
import { itemRunsByTask, loadRuns } from '../src/stats/load-runs.js';
import { mean } from '../src/stats/paired.js';
import { parsePreregistration } from '../src/stats/prereg.js';
import { injectedPowerCurve, splitHalfCheck } from '../src/stats/selfcheck.js';

const [label = '', preregPath = '', iterationsArg = '1000'] = process.argv.slice(2);
if (label === '' || preregPath === '') {
  throw new Error('사용: tsx scripts/score.ts <실행 이름> <사전 등록 JSON> [검증 반복 수]');
}
const iterations = Number(iterationsArg);
if (!Number.isInteger(iterations) || iterations <= 0)
  throw new Error('반복 수는 양의 정수여야 한다');

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const outRoot = join(repoRoot, 'results/es-toolkit-migrate', label);
const prereg = parsePreregistration(JSON.parse(readFileSync(preregPath, 'utf8')));
const runs = loadRuns(outRoot);
const { alpha, delta } = prereg;
const ARMS: readonly Arm[] = ['baseline', 'skill', 'placebo'];
const STATES: readonly RunStateName[] = ['completed', 'limit', 'infra', 'contaminated', 'harness'];

const lines: string[] = [];
const out = (line = ''): void => {
  lines.push(line);
};
const pct = (x: number | null): string => (x === null ? '-' : `${(x * 100).toFixed(1)}%`);
const pp = (x: number): string =>
  Number.isFinite(x) ? `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}pp` : x > 0 ? '+∞' : '−∞';
const interval = (i: Interval | null): string =>
  i === null ? '-' : `[${pp(i.lower)}, ${pp(i.upper)}]`;
const pv = (p: number): string => (p < 0.0001 ? '<0.0001' : p.toFixed(4));
const avg = (values: readonly number[]): number | null =>
  values.length === 0 ? null : mean(values);

// 1. 가설별 과제 차이와 판정
const pairsById = {} as Record<HypothesisId, PairedSet>;
for (const spec of HYPOTHESES) {
  pairsById[spec.id] = pairTasks(runs, prereg.tasks[spec.purpose], spec.control, spec.purpose);
}
const differences = (id: HypothesisId): number[] => pairsById[id].pairs.map((p) => p.difference);
const decisions = decideHypotheses(
  {
    H1: differences('H1'),
    H2: differences('H2'),
    H3: differences('H3'),
    H4: differences('H4'),
  },
  { alpha, delta },
);
const intervals = {} as Record<HypothesisId, { inversion: Interval | null; bca: Interval | null }>;
for (const spec of HYPOTHESES) {
  const d = differences(spec.id);
  intervals[spec.id] = {
    inversion: d.length === 0 ? null : signFlipInterval(d, alpha, { tolerance: 1e-5 }),
    bca: d.length < 2 ? null : bcaInterval(d, 1 - alpha, 1),
  };
}

const VERDICT_LABEL = {
  higher: '높음',
  lower: '낮음',
  equivalent: '동등',
  inconclusive: '판정 불가',
};
const missingGrades = runs.filter((r) => r.meta.state === 'completed' && r.grade === null);

out(`# es-toolkit migrate 목적 달성 평가 결과: ${label}`);
out();
out(
  `실행 ${runs.length}개, α = ${alpha}, δ = ±${(delta * 100).toFixed(0)}pp, 사전 등록 K = ${prereg.k}. 목적 1 대상 과제 ${prereg.tasks.p1.length}개, 목적 2 대상 과제 ${prereg.tasks.p2.length}개.`,
);
if (missingGrades.length > 0) {
  out();
  out(
    `> grade.json이 없는 정상 종료 실행이 ${missingGrades.length}개다. 채점기를 먼저 돌려야 한다. 이 실행들은 결측으로 처리했다: ${missingGrades.map((r) => r.meta.runId).join(', ')}`,
  );
}

out();
out('## 1. 가설별 판정');
out();
out(
  '차이는 과제마다 (skill 평균 − 대조 평균)이고, 과제·조건 평균은 실행별 항목 평균의 평균이다. 주 구간은 부호 뒤집기 검정을 뒤집은 구간이고 BCa 구간은 참고용이다. Holm 보정은 차이 검정 4개와 동등 검정 4개에 따로 적용했다.',
);
out();
out(
  '| 가설 | 목적 | 대조 | 과제 수 | skill 평균 | 대조 평균 | 평균 차이 | 역산 95% 구간 | BCa 95% 구간 | 차이 p | Holm 조정 p | 동등 p | Holm 조정 동등 p | 판정 |',
);
out('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const spec of HYPOTHESES) {
  const r = decisions[spec.id];
  const pairs = pairsById[spec.id].pairs;
  out(
    `| ${spec.id} | ${spec.purpose === 'p1' ? '목적 1' : '목적 2'} | ${spec.control} | ${r.n} | ${pct(avg(pairs.map((p) => p.skill)))} | ${pct(avg(pairs.map((p) => p.control)))} | ${r.n === 0 ? '-' : pp(r.meanDifference)} | ${interval(intervals[spec.id].inversion)} | ${interval(intervals[spec.id].bca)} | ${pv(r.pDifference)} | ${pv(r.pDifferenceAdjusted)} | ${pv(r.pEquivalence)} | ${pv(r.pEquivalenceAdjusted)} | **${VERDICT_LABEL[r.verdict]}** |`,
  );
}
for (const spec of HYPOTHESES) {
  const dropped = pairsById[spec.id].dropped;
  if (dropped.length > 0) {
    out();
    out(
      `- ${spec.id}: 한쪽 조건의 점수가 없어 뺀 과제 ${dropped.length}개 (${dropped.join(', ')})`,
    );
  }
}

// 2. 결론
const armCounts = ARMS.map((arm) => {
  const all = runs.filter((r) => r.meta.arm === arm);
  const byState = Object.fromEntries(
    STATES.map((s) => [s, all.filter((r) => r.meta.state === s).length]),
  ) as Record<RunStateName, number>;
  return {
    arm,
    total: all.length,
    byState,
    contaminatedShare: all.length === 0 ? 0 : byState.contaminated / all.length,
  };
});
const overContaminated = armCounts.filter((a) => a.contaminatedShare > 0.05);

out();
out('## 2. 판정 문장과 결론');
for (const purpose of ['p1', 'p2'] as const satisfies readonly Purpose[]) {
  const [vsBaseline, vsPlacebo] =
    purpose === 'p1' ? (['H1', 'H3'] as const) : (['H2', 'H4'] as const);
  const conclusion = conclude(decisions[vsBaseline].verdict, decisions[vsPlacebo].verdict);
  out();
  out(`### ${purpose === 'p1' ? '목적 1' : '목적 2'}`);
  out();
  for (const id of [vsBaseline, vsPlacebo]) {
    const spec = HYPOTHESES.find((h) => h.id === id);
    if (spec !== undefined) out(`- ${id}: ${verdictSentence(spec, decisions[id].verdict, delta)}`);
  }
  out();
  out(`**결론:** ${conclusionSentence(purpose, conclusion, delta)}`);
  if (conclusion === 'undetermined') {
    out();
    out(
      `baseline 대비 평균 차이의 95% 구간(부호 뒤집기 역산): ${interval(intervals[vsBaseline].inversion)}`,
    );
  }
}
if (overContaminated.length > 0) {
  out();
  out(
    `**한계:** 오염 실행 비율이 5%를 넘은 조건이 있다 (${overContaminated.map((a) => `${a.arm} ${pct(a.contaminatedShare)}`).join(', ')}). 오염 실행은 분석에서 뺐다.`,
  );
}

// 3. 목적 2의 항목 유형별 점수
out();
out('## 3. 목적 2의 항목 유형별 점수');
out();
out(
  '목적 2 대상 과제의 정상 종료 실행에서 항목 점수를 모은 단순 평균이다. 재분류된 S 항목은 D로 센다. 시간·턴 한도 실행은 항목 목록이 없어 빠진다.',
);
out();
out('| 조건 | S | D | C |');
out('|---|---|---|---|');
for (const arm of ARMS) {
  const rows = p2ByType(runs, prereg.tasks.p2, arm);
  out(`| ${arm} | ${rows.map((r) => `${pct(r.mean)} (${r.items})`).join(' | ')} |`);
}

// 4. 부차 지표
out();
out('## 4. 부차 지표 (판정하지 않음)');
out();
out(
  '모든 과제의 실행을 쓴다. 동작 보존 점수는 시간·턴 한도 실행을 0점으로 넣는다. 번들 크기는 목적 1 점수가 1인 실행만 쓴다.',
);
out();
out(
  '| 조건 | 동작 보존 점수 | 번들 바이트 평균 | 기준 해답 대비 번들 비율 | 평균 비용(USD) | 총 비용(USD) | 평균 시간(초) | 평균 턴 |',
);
out('|---|---|---|---|---|---|---|---|');
for (const arm of ARMS) {
  const own = runs.filter((r) => r.meta.arm === arm && r.meta.state !== 'contaminated');
  const behaviour = own
    .map((r) =>
      r.meta.state === 'limit'
        ? 0
        : r.meta.state === 'completed'
          ? (r.grade?.behaviourOnly ?? null)
          : null,
    )
    .filter((v): v is number => v !== null);
  const passing = own.filter(
    (r) => r.grade !== null && runScore(r, 'p1') === 1 && r.grade.bundleBytes !== null,
  );
  const bytes = passing.map((r) => r.grade?.bundleBytes ?? 0);
  const ratios = passing
    .map((r) => {
      const ref = prereg.referenceBundleBytes[r.meta.taskId];
      return ref === undefined ? null : (r.grade?.bundleBytes ?? 0) / ref;
    })
    .filter((v): v is number => v !== null);
  const costs = own
    .map((r) => runCost(r.meta, prereg.pricing))
    .filter((v): v is number => v !== null);
  const durations = own.map((r) => runDurationMs(r.meta)).filter((v): v is number => v !== null);
  const turns = own.map((r) => runTurnCount(r.meta)).filter((v): v is number => v !== null);
  const fmt = (v: number | null, digits: number): string => (v === null ? '-' : v.toFixed(digits));
  out(
    `| ${arm} | ${pct(avg(behaviour))} | ${fmt(avg(bytes), 0)} (${bytes.length}) | ${fmt(avg(ratios), 3)} (${ratios.length}) | ${fmt(avg(costs), 4)} | ${costs.reduce((s, c) => s + c, 0).toFixed(2)} | ${fmt(avg(durations.map((d) => d / 1000)), 0)} | ${fmt(avg(turns), 1)} |`,
  );
}
if (Object.keys(prereg.referenceBundleBytes).length === 0) {
  out();
  out('사전 등록에 기준 해답 번들 크기(referenceBundleBytes)가 없어 비율은 계산하지 않았다.');
}

// 5. 실행 상태
out();
out('## 5. 실행 상태');
out();
out('| 조건 | 실행 | 정상 종료 | 한도 | 인프라 실패 | 하네스 결함 | 오염 | 오염 비율 |');
out('|---|---|---|---|---|---|---|---|');
for (const a of armCounts) {
  out(
    `| ${a.arm} | ${a.total} | ${a.byState.completed} | ${a.byState.limit} | ${a.byState.infra} | ${a.byState.harness} | ${a.byState.contaminated} | ${pct(a.contaminatedShare)}${a.contaminatedShare > 0.05 ? ' **5% 초과**' : ''} |`,
  );
}

// 6. 조작 확인
const manipulationKeys = [
  ...new Set(runs.flatMap((r) => Object.keys(manipulationFlags(r.meta)))),
].sort();
out();
out('## 6. 조작 확인');
out();
if (manipulationKeys.length === 0 && runs.every((r) => r.meta.loadedSkills === undefined)) {
  out('meta.json에 조작 확인 기록(loadedSkills, ranAvailabilityCheck 등)이 없다.');
} else {
  out('오염·인프라·하네스 실행을 뺀 실행 가운데 해당 행동을 한 비율이다.');
  out();
  out(`| 조건 | Skill 로드 | 외부 접근 시도 | ${manipulationKeys.join(' | ')} |`);
  out(`|---|---|---|${manipulationKeys.map(() => '---|').join('')}`);
  for (const arm of ARMS) {
    const own = runs.filter(
      (r) => r.meta.arm === arm && (r.meta.state === 'completed' || r.meta.state === 'limit'),
    );
    const loaded = own.filter((r) => r.meta.loadedSkills !== undefined);
    const rate = (keyRuns: readonly RunRecord[], hit: (r: RunRecord) => boolean): string =>
      keyRuns.length === 0
        ? '-'
        : `${pct(keyRuns.filter(hit).length / keyRuns.length)} (${keyRuns.length})`;
    const cells = manipulationKeys.map((key) => {
      const withKey = own.filter((r) => manipulationFlags(r.meta)[key] !== undefined);
      return rate(withKey, (r) => manipulationFlags(r.meta)[key] === true);
    });
    const network = own.filter((r) => r.meta.networkAttempts !== undefined);
    out(
      `| ${arm} | ${rate(loaded, (r) => (r.meta.loadedSkills?.length ?? 0) > 0)} | ${rate(network, (r) => (r.meta.networkAttempts?.length ?? 0) > 0)} | ${cells.join(' | ')} |`,
    );
  }
}

// 7. 재분류 항목
out();
out('## 7. 재분류된 항목');
out();
const reclassified = runs.flatMap((r) =>
  (r.grade?.items ?? [])
    .filter((i) => i.reclassify === true)
    .map((i) => ({ run: r.meta, item: i })),
);
if (reclassified.length === 0) {
  out('S에서 D로 재분류된 항목이 없다.');
} else {
  out(
    '에이전트가 범위 안의 유효한 반례를 낸 S 항목이다. 재분류는 모든 조건에 똑같이 적용한다(설계 6.2).',
  );
  out();
  out('| 실행 | 조건 | 항목 | 함수 |');
  out('|---|---|---|---|');
  for (const { run, item } of reclassified)
    out(`| ${run.runId} | ${run.arm} | ${item.name} | ${item.fn} |`);
}

// 8. 판정 절차 검증
out();
out('## 8. 판정 절차 자체의 검증 (설계 8.2)');
out();
out(
  `baseline 실행만 쓴다. 판정은 1절과 같은 절차(Holm 4개 포함)이고, 검증 대상 가설 하나만 데이터를 넣고 나머지 셋은 p = 1로 둔다. 반복 ${iterations}회.`,
);
const strengths = [0.1, 0.2, 0.3, 0.5];
for (const purpose of ['p1', 'p2'] as const) {
  const itemRuns = itemRunsByTask(runs, prereg.tasks[purpose], 'baseline', purpose);
  const split = splitHalfCheck(itemRuns, iterations, alpha, delta, 1);
  out();
  out(`### ${purpose === 'p1' ? '목적 1' : '목적 2'}`);
  out();
  if (split.tasks === 0) {
    out('baseline 실행이 2개 이상인 과제가 없어 계산하지 않았다.');
    continue;
  }
  out(
    `- 반분 재표집 (과제 ${split.tasks}개): 차이 없는 데이터에서 높음·낮음 판정 비율 ${pct(split.directionalRate)}, 동등 판정 비율 ${pct(split.equivalentRate)}. 분할끼리 독립이 아니므로 오판정률 추정치가 아니라 구현 확인용이다.`,
  );
  out();
  out('| 처리 쪽 0점 항목을 1점으로 바꾼 확률 | 실제로 들어간 평균 차이 | 높음 판정 비율 |');
  out('|---|---|---|');
  for (const point of injectedPowerCurve(itemRuns, strengths, iterations, alpha, delta, 2)) {
    out(
      `| ${(point.strength * 100).toFixed(0)}% | ${pp(point.injectedDifference)} | ${pct(point.detectionRate)} |`,
    );
  }
}

writeFileSync(join(outRoot, 'report.md'), `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));
