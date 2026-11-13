/**
 * 저장된 실행 결과를 채점하고 판정한다. 에이전트를 다시 실행하지 않는다.
 *
 * 사용: pnpm tsx scripts/rescore.ts <실행 이름> [ε] [자기 코드 허용치] [δ] [1차 가설 수]
 * 출력: results/es-toolkit-migrate/<실행 이름>/scores.json 과 요약 표
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  computeReference,
  gradeMigrate,
  meetsRequirement,
  type Reference,
} from '../src/graders/migrate.js';
import type { RunState } from '../src/runner/state.js';
import { holm, mean, minNonzeroForAlpha, signFlipPValue } from '../src/stats/paired.js';
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
const sealedRoot = join(repoRoot, 'sealed/es-toolkit/migrate');
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

const planFile = JSON.parse(readFileSync(join(outRoot, 'plan.json'), 'utf8')) as {
  K: number;
  taskIds: string[];
};
const references = new Map<string, Reference>();
const scores: Score[] = [];

for (const runId of readdirSync(outRoot).sort()) {
  const metaFile = join(outRoot, runId, 'meta.json');
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
  const submission = readFileSync(join(outRoot, runId, 'submission.ts'), 'utf8');
  const grade = await gradeMigrate(task, source, submission, repoRoot);
  const pass = meetsRequirement(grade, reference.size, epsilon, reference.ownBytes + allowance);
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
  `${JSON.stringify({ epsilon, allowance, scores }, null, 2)}\n`,
  'utf8',
);

/** 과제별 통과 비율. 대조 arm의 주 비교에는 사전 지정한 앞의 K회만 쓴다. */
function taskScores(
  arm: string,
  metric: 'requirement' | 'correct',
  maxRepeat: number,
): (number | null)[] {
  return planFile.taskIds.map((taskId) => {
    const values = scores
      .filter((s) => s.taskId === taskId && s.arm === arm && s.repeat <= maxRepeat)
      .map((s) => s[metric])
      .filter((v): v is number => v !== null);
    return values.length === 0 ? null : mean(values);
  });
}

const K = planFile.K;
for (const metric of ['requirement', 'correct'] as const) {
  const treatment = taskScores('skill', metric, K);
  const control = taskScores('baseline', metric, K);
  const pairs = treatment
    .map((t, i) => ({ t, c: control[i] ?? null, id: planFile.taskIds[i] ?? '' }))
    .filter((p): p is { t: number; c: number; id: string } => p.t !== null && p.c !== null);
  if (pairs.length < 2) {
    console.log(`[${metric}] 짝지을 과제가 ${pairs.length}개라 판정할 수 없다`);
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
  console.log(
    `\n[${metric === 'requirement' ? '요구 충족' : '정확성'}] 과제 ${pairs.length}개, K=${K}`,
  );
  console.log(
    `  skill ${mean(pairs.map((x) => x.t)).toFixed(3)}  baseline ${mean(pairs.map((x) => x.c)).toFixed(3)}  차이 ${result.meanDifference.toFixed(3)}`,
  );
  console.log(
    `  95% 구간 [${result.interval95.lower.toFixed(3)}, ${result.interval95.upper.toFixed(3)}]  p=${result.pValue.toFixed(4)}  0이 아닌 차이 ${result.nonzeroDifferences}개`,
  );
  console.log(`  판정: ${result.verdict}${result.reason === null ? '' : ` (${result.reason})`}`);
  for (const pair of pairs)
    console.log(`    ${pair.id}  skill ${pair.t.toFixed(2)}  baseline ${pair.c.toFixed(2)}`);
}

const states: Record<string, Record<string, number>> = {};
for (const s of scores) {
  const perArm = (states[s.arm] ??= {});
  perArm[s.state] = (perArm[s.state] ?? 0) + 1;
}
console.log(`\n실행 상태: ${JSON.stringify(states)}`);
for (const arm of Object.keys(states)) {
  const rows = scores.filter((s) => s.arm === arm && s.usage !== null);
  if (rows.length === 0) continue;
  const avg = (pick: (s: Score) => number): number => Math.round(mean(rows.map(pick)));
  console.log(
    `${arm}: 평균 턴 ${avg((s) => s.turns ?? 0)}, 시간 ${avg((s) => s.durationMs / 1000)}초, 출력 토큰 ${avg((s) => s.usage?.output ?? 0)}, ` +
      `입력 ${avg((s) => (s.usage?.input ?? 0) + (s.usage?.cacheRead ?? 0) + (s.usage?.cacheCreation ?? 0))}`,
  );
}
