/**
 * 저장된 실행 결과를 채점하고 판정한다. 에이전트를 다시 실행하지 않는다.
 *
 * 사용: pnpm tsx scripts/rescore.ts <실행 이름> [ε] [자기 코드 허용치] [δ] [1차 가설 수]
 * 출력: results/es-toolkit-migrate/<실행 이름>/{scores.json, report.md}
 *
 * 실행별 채점 결과(동작, 타입, 크기)는 임계값과 무관하므로 grade.json에 캐시한다.
 * 제출물의 해시가 같으면 다시 채점하지 않는다. 임계값만 바꿔 재판정할 때 시간을 줄인다.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  computeReference,
  gradeMigrate,
  type MigrateGrade,
  type Reference,
} from '../src/graders/migrate.js';
import { withinSizeBudget } from '../src/graders/size.js';
import type { RunState } from '../src/runner/state.js';
import { bcaInterval } from '../src/stats/bootstrap.js';
import { holm, mean, minNonzeroForAlpha, signFlipPValue } from '../src/stats/paired.js';
import { powerCurve, splitHalf } from '../src/stats/validation.js';
import { decide } from '../src/stats/verdict.js';
import { loadTaskWithGeneratedInputs } from '../src/tasks/generated.js';

const [label = '', epsArg = '0.05', allowanceArg = '200', deltaArg = '0.1', hypothesesArg = '1'] =
  process.argv.slice(2);
if (label === '') throw new Error('실행 이름을 지정해야 한다');
const epsilon = Number(epsArg);
const allowance = Number(allowanceArg);
const delta = Number(deltaArg);
const hypotheses = Number(hypothesesArg);
const ALPHA = 0.05;

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const publicRoot = join(repoRoot, 'suites/es-toolkit/migrate/tasks');
const sealedRoot = process.env['SKILL_EVAL_SEALED'] ?? join(repoRoot, 'sealed/es-toolkit/migrate');
const outRoot = join(repoRoot, 'results/es-toolkit-migrate', label);

interface Meta {
  readonly runId: string;
  readonly taskId: string;
  readonly arm: string;
  readonly repeat: number;
  readonly state: RunState;
  readonly submissionKind: string;
  readonly turns: number | null;
  readonly durationMs: number;
  readonly usage: {
    input: number;
    output: number;
    cacheRead: number;
    cacheCreation: number;
  } | null;
}

interface Score extends Meta {
  /** 1 통과, 0 실패, null 분석에서 제외(인프라·하네스 실패). */
  readonly requirement: number | null;
  readonly correct: number | null;
  readonly size: number | null;
  readonly ownBytes: number | null;
}

type Metric = 'requirement' | 'correct';

const planFile = JSON.parse(readFileSync(join(outRoot, 'plan-primary.json'), 'utf8')) as {
  model: string;
  K: number;
  taskIds: string[];
};
const K = planFile.K;
const references = new Map<string, Reference>();
const scores: Score[] = [];
const sha = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

async function cachedGrade(
  runDir: string,
  compute: () => Promise<MigrateGrade>,
  submission: string,
): Promise<Pick<MigrateGrade, 'correct' | 'size' | 'ownBytes'>> {
  const cacheFile = join(runDir, 'grade.json');
  const key = sha(submission);
  if (existsSync(cacheFile)) {
    const cached = JSON.parse(readFileSync(cacheFile, 'utf8')) as {
      key: string;
      correct: boolean;
      size: number | null;
      ownBytes: number | null;
    };
    if (cached.key === key) return cached;
  }
  const grade = await compute();
  const slim = { correct: grade.correct, size: grade.size, ownBytes: grade.ownBytes };
  writeFileSync(cacheFile, `${JSON.stringify({ key, ...slim }, null, 2)}\n`, 'utf8');
  return slim;
}

for (const runId of readdirSync(outRoot).sort()) {
  const runDir = join(outRoot, runId);
  const metaFile = join(runDir, 'meta.json');
  if (!existsSync(metaFile)) continue;
  const meta = JSON.parse(readFileSync(metaFile, 'utf8')) as Meta;
  if (meta.state === 'contaminated') {
    throw new Error(`${runId}: 대조 arm에 대상 Skill이 로드됐다. 실행 묶음 전체가 무효다`);
  }
  if (meta.state === 'infra' || meta.state === 'harness') {
    scores.push({ ...meta, requirement: null, correct: null, size: null, ownBytes: null });
    continue;
  }
  const { task, source } = await loadTaskWithGeneratedInputs(
    join(publicRoot, meta.taskId),
    join(sealedRoot, `${meta.taskId}.json`),
  );
  let reference = references.get(meta.taskId);
  if (reference === undefined) {
    reference = await computeReference(task, source, repoRoot);
    references.set(meta.taskId, reference);
  }
  if (meta.state === 'limit') {
    // 의도 배정 분석: 시간·턴 한도에 걸린 실행은 0점으로 넣는다.
    scores.push({ ...meta, requirement: 0, correct: 0, size: null, ownBytes: null });
    continue;
  }
  const submission = readFileSync(join(runDir, 'submission.ts'), 'utf8');
  const grade = await cachedGrade(
    runDir,
    () => gradeMigrate(task, source, submission, repoRoot),
    submission,
  );
  // graders/migrate.ts의 meetsRequirement와 같은 조건이다. 캐시에는 동작·타입의 세부가 없으므로
  // 정확성 여부와 측정값으로 직접 판정한다.
  const pass =
    grade.correct &&
    grade.size !== null &&
    grade.ownBytes !== null &&
    withinSizeBudget(grade.size, reference.size, epsilon) &&
    grade.ownBytes <= reference.ownBytes + allowance;
  scores.push({
    ...meta,
    requirement: pass ? 1 : 0,
    correct: grade.correct ? 1 : 0,
    size: grade.size,
    ownBytes: grade.ownBytes,
  });
}
writeFileSync(
  join(outRoot, 'scores.json'),
  `${JSON.stringify({ epsilon, allowance, delta, hypotheses, scores }, null, 2)}\n`,
  'utf8',
);

/** 과제별 통과 비율. 대조 arm의 주 비교에는 사전 지정한 앞의 K회만 쓴다. */
function taskScores(arm: string, metric: Metric, maxRepeat: number): (number | null)[] {
  return planFile.taskIds.map((taskId) => {
    const values = scores
      .filter((s) => s.taskId === taskId && s.arm === arm && s.repeat <= maxRepeat)
      .map((s) => s[metric])
      .filter((v): v is number => v !== null);
    return values.length === 0 ? null : mean(values);
  });
}

function paired(treatmentArm: string, controlArm: string, metric: Metric) {
  const t = taskScores(treatmentArm, metric, K);
  const c = taskScores(controlArm, metric, K);
  return planFile.taskIds
    .map((id, i) => ({ id, t: t[i] ?? null, c: c[i] ?? null }))
    .filter((p): p is { id: string; t: number; c: number } => p.t !== null && p.c !== null);
}

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
const pp = (x: number): string => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}pp`;
const lines: string[] = [];
const out = (line = ''): void => {
  lines.push(line);
  console.log(line);
};

out(`# es-toolkit migrate 평가 결과: ${label}`);
out();
out(
  `모델 ${planFile.model}, 과제 ${planFile.taskIds.length}개, K=${K}. ε=${epsilon}, 자기 코드 허용치 ${allowance}B, δ=${delta}, 1차 가설 ${hypotheses}개, α=${ALPHA}.`,
);

const VERDICT: Record<string, string> = {
  improved: '개선',
  worsened: '악화',
  equivalent: '동등',
  inconclusive: '판정 불가',
};
const REASON: Record<string, string> = {
  'no-headroom': '대조 arm에 차이가 날 여지가 없다',
  'not-equivalent': '차이 검정도 동등 검정도 유의하지 않다',
  'equivalence-disabled': '동등 판정을 쓰지 않는 추정 대상',
};

for (const metric of ['requirement', 'correct'] as const) {
  const pairs = paired('skill', 'baseline', metric);
  out();
  out(
    `## ${metric === 'requirement' ? '1차 지표: 요구 충족' : '2차 지표: 정확성'} (skill 대 baseline)`,
  );
  out();
  if (pairs.length < 2) {
    out(`짝지을 과제가 ${pairs.length}개라 판정하지 않았다.`);
    continue;
  }
  const d = pairs.map((p) => p.t - p.c);
  const p = signFlipPValue(d);
  const significant =
    holm([p, ...Array.from({ length: hypotheses - 1 }, () => 1)], ALPHA)[0] ?? false;
  const result = decide(
    d,
    pairs.map((x) => x.c),
    {
      alpha: ALPHA,
      hypotheses,
      significant,
      delta,
      minDiscriminating: minNonzeroForAlpha(ALPHA / hypotheses),
      equivalenceEnabled: true,
    },
  );
  out('| 항목 | 값 |');
  out('|---|---|');
  out(`| skill 평균 통과율 | ${pct(mean(pairs.map((x) => x.t)))} |`);
  out(`| baseline 평균 통과율 | ${pct(mean(pairs.map((x) => x.c)))} |`);
  out(`| 평균 차이 | ${pp(result.meanDifference)} |`);
  out(
    `| 과제 단위 BCa 95% 구간 | [${pp(result.interval95.lower)}, ${pp(result.interval95.upper)}] |`,
  );
  out(`| 부호 뒤집기 검정 p | ${result.pValue.toFixed(4)} |`);
  out(`| 0이 아닌 차이 | ${result.nonzeroDifferences}개 |`);
  out(
    `| 판정 | **${VERDICT[result.verdict] ?? result.verdict}**${result.reason === null ? '' : ` (${REASON[result.reason] ?? result.reason})`} |`,
  );
  out();
  out('| 과제 | skill | baseline | 차이 |');
  out('|---|---|---|---|');
  for (const pair of pairs) {
    out(`| ${pair.id} | ${pair.t.toFixed(2)} | ${pair.c.toFixed(2)} | ${pp(pair.t - pair.c)} |`);
  }
}

const otherArms = [...new Set(scores.map((s) => s.arm))].filter(
  (arm) => arm !== 'baseline' && arm !== 'skill',
);
if (otherArms.length > 0) {
  out();
  out('## 탐색용 비교 (보정하지 않음, 요구 충족)');
  out();
  out('| 비교 | 처리 평균 | 대조 평균 | 평균 차이 | BCa 95% 구간 | p | 0이 아닌 차이 |');
  out('|---|---|---|---|---|---|---|');
  const comparisons: [string, string][] = [];
  for (const arm of otherArms) comparisons.push([arm, 'baseline'], ['skill', arm]);
  for (const [treatment, control] of comparisons) {
    const pairs = paired(treatment, control, 'requirement');
    if (pairs.length < 2) continue;
    const d = pairs.map((x) => x.t - x.c);
    const interval = bcaInterval(d, 0.95, 1);
    out(
      `| ${treatment} 대 ${control} | ${pct(mean(pairs.map((x) => x.t)))} | ${pct(mean(pairs.map((x) => x.c)))} | ${pp(mean(d))} | [${pp(interval.lower)}, ${pp(interval.upper)}] | ${signFlipPValue(d).toFixed(4)} | ${d.filter((x) => x !== 0).length}개 |`,
    );
  }
}

out();
out('## 실행 상태와 비용');
out();
out(
  '| arm | 실행 | completed | limit | infra | 평균 턴 | 평균 시간 | 평균 입력 토큰 | 평균 출력 토큰 |',
);
out('|---|---|---|---|---|---|---|---|---|');
for (const arm of ['baseline', 'skill', ...otherArms]) {
  const rows = scores.filter((s) => s.arm === arm);
  if (rows.length === 0) continue;
  const used = rows.filter((s) => s.usage !== null);
  const avg = (pick: (s: Score) => number): number =>
    used.length === 0 ? 0 : Math.round(mean(used.map(pick)));
  const count = (state: RunState): number => rows.filter((s) => s.state === state).length;
  out(
    `| ${arm} | ${rows.length} | ${count('completed')} | ${count('limit')} | ${count('infra') + count('harness')} | ${avg((s) => s.turns ?? 0)} | ${avg((s) => s.durationMs / 1000)}초 | ${avg((s) => (s.usage?.input ?? 0) + (s.usage?.cacheRead ?? 0) + (s.usage?.cacheCreation ?? 0)).toLocaleString('en-US')} | ${avg((s) => s.usage?.output ?? 0).toLocaleString('en-US')} |`,
  );
}

// 분석 절차의 검증. 대조 arm의 요구 충족 점수만 쓴다.
const baselineRuns = planFile.taskIds
  .map((taskId) =>
    scores
      .filter((s) => s.taskId === taskId && s.arm === 'baseline' && s.requirement !== null)
      .sort((a, b) => a.repeat - b.repeat)
      .map((s) => s.requirement ?? 0),
  )
  .filter((runs) => runs.length >= 2 * K);
out();
out('## 분석 절차의 검증');
out();
if (baselineRuns.length >= 2) {
  const trimmed = baselineRuns.map((runs) => runs.slice(0, 2 * K));
  const split = splitHalf(trimmed, 1000, ALPHA, hypotheses, 1);
  const baselineRate = mean(trimmed.flat());
  out(
    `대조 arm 실행이 2K회 모두 있는 과제 ${trimmed.length}개, 대조 arm 평균 통과율 ${pct(baselineRate)}.`,
  );
  out();
  out(
    `- 반분 재표집 1,000회: 차이 없는 데이터에서 개선·악화로 판정된 비율 ${pct(split.falseVerdictRate)}`,
  );
  out();
  out(
    '| 실행당 주입 확률 | 개선 방향 검출률 | 악화 방향 검출률 | 개선 방향 통과율 차이(근사) | 악화 방향 통과율 차이(근사) |',
  );
  out('|---|---|---|---|---|');
  const strengths = [0.05, 0.1, 0.2, 0.4];
  const up = powerCurve(trimmed, K, strengths, 'improve', 500, ALPHA, hypotheses, 2);
  const down = powerCurve(trimmed, K, strengths, 'worsen', 500, ALPHA, hypotheses, 2);
  strengths.forEach((s, i) => {
    out(
      `| ${Math.round(s * 100)}% | ${pct(up[i]?.detectionRate ?? 0)} | ${pct(down[i]?.detectionRate ?? 0)} | ${pp(s * (1 - baselineRate))} | ${pp(-s * baselineRate)} |`,
    );
  });
} else {
  out('대조 arm 실행이 2K회 모두 있는 과제가 2개 미만이라 계산하지 않았다.');
}

writeFileSync(join(outRoot, 'report.md'), `${lines.join('\n')}\n`, 'utf8');
