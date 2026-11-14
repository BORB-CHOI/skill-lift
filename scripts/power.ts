/**
 * 반복 횟수 K를 정하는 검출력 계산.
 *
 * 1. 스모크·파일럿 실행에서 (프로젝트, 모델)마다 실행 점수의 표준편차를 조건별 편차로 합쳐 추정하고,
 *    카이제곱 95% 상한을 쓴다(src/stats/simulate.ts).
 * 2. 베타-이항 점수 모형으로 K = 3..15마다 데이터셋을 만들고 score.ts와 같은 판정(순열 검정, TOST,
 *    Holm 8개)을 적용한다.
 *    - 효과 시나리오: skill 평균이 baseline·placebo보다 δ 높다. "높음" 비율을 센다.
 *    - 효과 0 시나리오: 세 조건 평균이 같다. "동등" 비율을 센다.
 * 3. (프로젝트, 모델)마다 두 가설 모두 두 비율이 0.8 이상인 가장 작은 K를 낸다.
 * 4. K마다 실행 수와 예상 소요 시간을 낸다. 실행당 시간은 --run-minutes, 없으면 파일럿 평균이다.
 *
 * 사용: pnpm tsx scripts/power.ts <파일럿 실행 이름> [--run-minutes 분] [--concurrency 1]
 *       [--sims 1000] [--delta 0.15] [--alpha 0.05] [--seed 1] [--k-min 3] [--k-max 15]
 *       [--projects a,b] [--models x,y]
 */
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  ARMS,
  armScores,
  cellRuns,
  medianItemCount,
  runDurationMs,
  summarize,
} from '../src/stats/aggregate.js';
import {
  DESIGN_MODELS,
  DESIGN_PROJECTS,
  hypothesisKey,
  modelLabel,
  type ControlArm,
} from '../src/stats/decision.js';
import { loadRuns } from '../src/stats/load-runs.js';
import { mean } from '../src/stats/paired.js';
import {
  fitDispersion,
  pooledSd,
  sdUpperBound,
  simulatePower,
  simulationMean,
  type CellModel,
  type VerdictRates,
} from '../src/stats/simulate.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    'run-minutes': { type: 'string' },
    concurrency: { type: 'string', default: '1' },
    sims: { type: 'string', default: '1000' },
    delta: { type: 'string', default: '0.15' },
    alpha: { type: 'string', default: '0.05' },
    seed: { type: 'string', default: '1' },
    'k-min': { type: 'string', default: '3' },
    'k-max': { type: 'string', default: '15' },
    projects: { type: 'string' },
    models: { type: 'string' },
  },
});
const label = positionals[0] ?? '';
if (label === '') throw new Error('사용: tsx scripts/power.ts <파일럿 실행 이름> [옵션]');
const positive = (name: string, raw: string | undefined): number => {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0)
    throw new Error(`--${name} 값이 잘못됐다: ${String(raw)}`);
  return value;
};
const list = (raw: string | undefined, fallback: readonly string[]): string[] =>
  raw === undefined
    ? [...fallback]
    : raw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s !== '');

const sims = positive('sims', values.sims);
const delta = positive('delta', values.delta);
const alpha = positive('alpha', values.alpha);
const seed = positive('seed', values.seed);
const concurrency = positive('concurrency', values.concurrency);
const kMin = positive('k-min', values['k-min']);
const kMax = positive('k-max', values['k-max']);
const projects = list(values.projects, DESIGN_PROJECTS);
const models = list(values.models, DESIGN_MODELS);
const TARGET = 0.8;

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const runs = loadRuns(join(repoRoot, 'results/es-toolkit-migrate', label));

interface Estimate {
  readonly cell: CellModel;
  readonly counts: string;
  readonly baselineMean: number;
  readonly sd: number;
  readonly df: number;
  readonly sdUpper: number;
  readonly achievedSd: number;
  readonly clamped: string;
}

const estimates: Estimate[] = [];
const problems: string[] = [];
for (const project of projects) {
  for (const model of models) {
    const own = cellRuns(runs, project, model);
    const scores = ARMS.map((arm) => armScores(own, arm));
    const pooled = pooledSd(scores);
    const items = medianItemCount(own);
    const name = `${project} · ${modelLabel(model)}`;
    if (pooled === null || items === null) {
      problems.push(
        `${name}: ${pooled === null ? '실행이 2개 이상인 조건이 없어 표준편차를 낼 수 없다' : 'grade.json이 없어 항목 수를 알 수 없다'}`,
      );
      continue;
    }
    const baseline = summarize(scores[0] ?? []).mean ?? mean(scores.flat());
    const sdUpper = sdUpperBound(pooled.sd, pooled.df);
    const mu = simulationMean(baseline, sdUpper, delta);
    const dispersion = fitDispersion(mu, items, sdUpper);
    estimates.push({
      cell: { project, model, items, mu, rho: dispersion.rho },
      counts: scores.map((s) => s.length).join('/'),
      baselineMean: baseline,
      sd: pooled.sd,
      df: pooled.df,
      sdUpper,
      achievedSd: dispersion.achievedSd,
      clamped:
        dispersion.clamped === 'floor'
          ? ' (이항 분산이 하한)'
          : dispersion.clamped === 'ceiling'
            ? ' (최대 분산에서 자름)'
            : '',
    });
  }
}
if (problems.length > 0) throw new Error(`파일럿 자료가 부족하다:\n${problems.join('\n')}`);

const pilotMinutes = runs
  .map((r) => runDurationMs(r.meta))
  .filter((v): v is number => v !== null)
  .map((ms) => ms / 60_000);
const runMinutes =
  values['run-minutes'] === undefined
    ? pilotMinutes.length === 0
      ? null
      : mean(pilotMinutes)
    : positive('run-minutes', values['run-minutes']);

console.log(`# 검출력 계산: ${label}`);
console.log();
console.log(
  '실행 점수 모형은 베타-이항이다. 표준편차는 조건별 평균에서 잰 편차를 합친 값이고, 시뮬레이션에는 카이제곱 95% 상한을 쓴다. baseline 평균은 skill 평균(+δ)이 1을 넘지 않게 1 − δ 이하로 자른다.',
);
console.log();
console.log(
  '| 프로젝트 | 모델 | 실행 (baseline/skill/placebo) | baseline 평균 | 합친 SD | 자유도 | SD 95% 상한 | 항목 수 | 시뮬레이션 baseline 평균 | 실행 간 상관 ρ | 시뮬레이션 SD |',
);
console.log('|---|---|---|---|---|---|---|---|---|---|---|');
for (const e of estimates) {
  console.log(
    `| ${e.cell.project} | ${modelLabel(e.cell.model)} | ${e.counts} | ${e.baselineMean.toFixed(3)} | ${e.sd.toFixed(3)} | ${e.df} | ${e.sdUpper.toFixed(3)} | ${e.cell.items} | ${e.cell.mu.toFixed(3)} | ${e.cell.rho.toFixed(3)} | ${e.achievedSd.toFixed(3)}${e.clamped} |`,
  );
}

const cells = estimates.map((e) => e.cell);
const kValues = Array.from({ length: kMax - kMin + 1 }, (_, i) => kMin + i);
const effect = new Map<number, VerdictRates>();
const nullRates = new Map<number, VerdictRates>();
for (const k of kValues) {
  const started = Date.now();
  const base = { cells, k, iterations: sims, alpha, delta };
  effect.set(k, simulatePower({ ...base, scenario: 'effect', seed: seed * 1000 + k }));
  nullRates.set(k, simulatePower({ ...base, scenario: 'null', seed: seed * 1000 + 500 + k }));
  console.error(`K = ${k} 계산 완료 (${((Date.now() - started) / 1000).toFixed(1)}초)`);
}

const key = (cell: CellModel, control: ControlArm): string =>
  hypothesisKey({ project: cell.project, model: cell.model, control });
const read = (rates: VerdictRates | undefined, k: string, v: 'higher' | 'equivalent'): number =>
  rates?.[k]?.[v] ?? 0;

console.log();
console.log(
  `데이터셋 ${sims}개씩, α = ${alpha}, δ = ${delta}, Holm 보정은 가설 ${cells.length * 2}개 전체에 적용했다. 효과 시나리오의 참 차이는 두 가설 모두 +δ다.`,
);
const smallest = new Map<CellModel, number | null>();
for (const cell of cells) {
  console.log();
  console.log(`## ${cell.project} · ${modelLabel(cell.model)}`);
  console.log();
  console.log(
    '| K | 높음 (skill vs baseline) | 높음 (skill vs placebo) | 동등 (skill vs baseline) | 동등 (skill vs placebo) | 0.8 충족 |',
  );
  console.log('|---|---|---|---|---|---|');
  let first: number | null = null;
  for (const k of kValues) {
    const cellsText = [
      read(effect.get(k), key(cell, 'baseline'), 'higher'),
      read(effect.get(k), key(cell, 'placebo'), 'higher'),
      read(nullRates.get(k), key(cell, 'baseline'), 'equivalent'),
      read(nullRates.get(k), key(cell, 'placebo'), 'equivalent'),
    ];
    const ok = Math.min(...cellsText) >= TARGET;
    if (ok && first === null) first = k;
    console.log(
      `| ${k} | ${cellsText.map((v) => v.toFixed(3)).join(' | ')} | ${ok ? '예' : '아니오'} |`,
    );
  }
  smallest.set(cell, first);
}

const hours = (minutes: number): string =>
  minutes >= 60
    ? `${Math.floor(minutes / 60)}시간 ${Math.round(minutes % 60)}분`
    : `${Math.round(minutes)}분`;
const wallTime = (k: number): string => {
  if (runMinutes === null) return '-';
  const runCount = cells.length * ARMS.length * k;
  return hours(Math.ceil(runCount / concurrency) * runMinutes);
};

console.log();
console.log('## K별 실행 수와 예상 소요 시간');
console.log();
console.log(
  runMinutes === null
    ? '실행당 시간을 알 수 없다. --run-minutes를 주면 계산한다.'
    : `실행당 ${runMinutes.toFixed(1)}분(${values['run-minutes'] === undefined ? `파일럿 실행 ${pilotMinutes.length}개의 평균` : '--run-minutes'}), 동시 실행 ${concurrency}개로 계산했다. 동시 실행 묶음마다 실행 하나의 시간이 걸린다고 본다.`,
);
console.log();
console.log('| K | 실행 수 | 예상 소요 |');
console.log('|---|---|---|');
for (const k of kValues) {
  console.log(`| ${k} | ${cells.length * ARMS.length * k} | ${wallTime(k)} |`);
}

console.log();
console.log('## 결과');
console.log();
for (const cell of cells) {
  const k = smallest.get(cell) ?? null;
  console.log(
    k === null
      ? `- ${cell.project} · ${modelLabel(cell.model)}: K = ${kMin}..${kMax} 어느 값에서도 두 가설의 높음·동등 비율이 모두 ${TARGET} 이상이 되지 않는다.`
      : `- ${cell.project} · ${modelLabel(cell.model)}: 두 가설의 높음·동등 비율이 모두 ${TARGET} 이상이 되는 가장 작은 K = ${k} (실행 ${ARMS.length * k}개).`,
  );
}
const needed = [...smallest.values()];
if (needed.length > 0 && needed.every((k): k is number => k !== null)) {
  const k = Math.max(...needed);
  console.log();
  console.log(
    `모든 (프로젝트, 모델)이 기준을 넘는 K = ${k}. 실행 ${cells.length * ARMS.length * k}개, 예상 소요 ${wallTime(k)}.`,
  );
}
