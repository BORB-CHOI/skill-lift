/**
 * 반복 횟수 K를 정하는 검출력 계산 (설계 8.1).
 *
 * 1. 파일럿 baseline 실행 가운데 추정용 3~4회차만 쓴다(4.4). 거르기에 쓴 1~2회차는 쓰지 않는다.
 * 2. 목적마다 남은 과제로 로짓 척도 무작위 절편 모형을 맞춘다(src/stats/glmm.ts, Gauss–Hermite
 *    20점 최대우도). 과제 간 분산은 프로파일 가능도 95% 상한을 쓴다.
 * 3. K = 2..10마다 데이터셋을 만들어 8절 절차(Holm 4개 포함)를 적용한다(src/stats/simulate.ts).
 *    - 균일 효과: skill 평균 점수를 δ 올린다. "높음" 비율을 센다.
 *    - 과제별 효과: 평균 상승은 δ로 같고 과제마다 효과가 다르다. "높음" 비율을 센다.
 *    - 효과 0: "동등" 비율을 센다.
 * 4. 네 가설 모두에서 "높음"(균일 효과)과 "동등"(효과 0)이 0.8 이상인 가장 작은 K를 낸다.
 *    과제별 효과까지 0.8 이상인 가장 작은 K도 따로 낸다.
 *
 * 사용: pnpm tsx scripts/power.ts <파일럿 실행 이름> --p1 t1,t2,... --p2 t3,t4,...
 *       [--retained 파일.json] [--sims 1000] [--delta 0.15] [--alpha 0.05] [--n1 N] [--n2 N] [--seed 1]
 * --retained 파일은 { "p1": [...], "p2": [...] } 형식이다. --n1, --n2를 주지 않으면 N은 남은 과제 수다.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Purpose } from '../src/stats/decision.js';
import { HYPOTHESES } from '../src/stats/decision.js';
import { fitRandomIntercept, populationMean, type RandomInterceptFit } from '../src/stats/glmm.js';
import { itemRunsByTask, loadRuns } from '../src/stats/load-runs.js';
import {
  simulateVerdicts,
  solveShift,
  type PurposeModel,
  type VerdictRates,
} from '../src/stats/simulate.js';

const argv = process.argv.slice(2);
const label = argv[0] ?? '';
if (label === '' || label.startsWith('--')) {
  throw new Error('사용: tsx scripts/power.ts <파일럿 실행 이름> --p1 ... --p2 ...');
}
function option(name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? undefined : argv[index + 1];
}
const numberOption = (name: string, fallback: number): number => {
  const raw = option(name);
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isFinite(value) || value <= 0)
    throw new Error(`--${name} 값이 잘못됐다: ${String(raw)}`);
  return value;
};
const list = (raw: string | undefined): string[] =>
  raw === undefined
    ? []
    : raw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s !== '');

const retainedFile = option('retained');
const retained: Record<Purpose, string[]> =
  retainedFile === undefined
    ? { p1: list(option('p1')), p2: list(option('p2')) }
    : (JSON.parse(readFileSync(retainedFile, 'utf8')) as Record<Purpose, string[]>);
const sims = numberOption('sims', 1000);
const delta = numberOption('delta', 0.15);
const alpha = numberOption('alpha', 0.05);
const seed = numberOption('seed', 1);
const N: Record<Purpose, number> = {
  p1: numberOption('n1', retained.p1.length),
  p2: numberOption('n2', retained.p2.length),
};
const K_VALUES = [2, 3, 4, 5, 6, 7, 8, 9, 10];
const TARGET = 0.8;

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const runs = loadRuns(join(repoRoot, 'results/es-toolkit-migrate', label));

const fits = {} as Record<Purpose, RandomInterceptFit>;
const models = {} as Record<Purpose, PurposeModel>;
for (const purpose of ['p1', 'p2'] as const) {
  if (retained[purpose].length < 2) throw new Error(`${purpose}: 남은 과제가 2개 미만이다`);
  // 추정용 3~4회차만 쓴다.
  const itemRuns = itemRunsByTask(
    runs,
    retained[purpose],
    'baseline',
    purpose,
    (r) => r >= 3 && r <= 4,
  );
  const counts = itemRuns.map((taskRuns, i) => {
    const flat = taskRuns.flat();
    if (flat.length === 0)
      throw new Error(`${purpose}: ${retained[purpose][i] ?? ''}에 3~4회차 baseline 점수가 없다`);
    return { successes: flat.reduce((s, v) => s + v, 0), trials: flat.length };
  });
  const itemCounts = itemRuns
    .flatMap((taskRuns) => taskRuns.map((r) => r.length))
    .sort((a, b) => a - b);
  const items = itemCounts[Math.floor(itemCounts.length / 2)] ?? 3;
  const fit = fitRandomIntercept(counts);
  fits[purpose] = fit;
  models[purpose] = { mu: fit.muAtUpper, tau: fit.tauUpper, items, tasks: N[purpose] };
}

console.log(`# 검출력 계산: ${label} (3~4회차 baseline)`);
console.log();
console.log(
  '모형: logit(p_i) = μ + u_i, u_i ~ N(0, τ²), 항목 관측은 Bernoulli(p_i). Gauss–Hermite 20점 최대우도.',
);
console.log();
console.log(
  '| 목적 | 과제 | 관측 수 | 관측 평균 | μ̂ | τ̂ | τ 95% 상한 | τ² 95% 상한 | 상한에서의 μ | 상한 모형의 평균 점수 | 항목 수 | 시뮬레이션 N |',
);
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const purpose of ['p1', 'p2'] as const) {
  const f = fits[purpose];
  const m = models[purpose];
  console.log(
    `| ${purpose} | ${f.tasks} | ${f.trials} | ${f.observedMean.toFixed(3)} | ${f.mu.toFixed(3)} | ${f.tau.toFixed(2)} | ${f.tauUpper.toFixed(2)}${f.capped ? ' (격자 끝)' : ''} | ${(f.tauUpper ** 2).toFixed(2)} | ${f.muAtUpper.toFixed(3)} | ${populationMean(m.mu, m.tau).toFixed(3)} | ${m.items} | ${m.tasks} |`,
  );
}

const shift = {
  p1: solveShift(models.p1.mu, models.p1.tau, delta, 0),
  p2: solveShift(models.p2.mu, models.p2.tau, delta, 0),
};
const hetShift = {
  p1: solveShift(models.p1.mu, models.p1.tau, delta, 1),
  p2: solveShift(models.p2.mu, models.p2.tau, delta, 1),
};
if (shift.p1 === null || shift.p2 === null || hetShift.p1 === null || hetShift.p2 === null) {
  console.log();
  console.log(
    `baseline 평균이 높아 평균 점수를 ${delta} 올리는 효과를 만들 수 없다. 계산을 멈춘다.`,
  );
  process.exit(1);
}
console.log();
console.log(
  `로짓 이동량: 균일 효과 p1 ${shift.p1.toFixed(3)}, p2 ${shift.p2.toFixed(3)} / 과제별 효과(평균) p1 ${hetShift.p1.toFixed(3)}, p2 ${hetShift.p2.toFixed(3)}, 과제별 표준편차는 평균과 같다.`,
);

const rate = (rates: VerdictRates, verdict: 'higher' | 'equivalent'): number[] =>
  HYPOTHESES.map((h) => rates[h.id][verdict]);
const cells = (values: readonly number[]): string => values.map((v) => v.toFixed(2)).join(' / ');

console.log();
console.log(
  `데이터셋 ${sims}개씩, α = ${alpha}, δ = ${delta}. 칸 안의 값은 H1 / H2 / H3 / H4 순서다.`,
);
console.log();
console.log(
  '| K | 균일 효과: 높음 | 과제별 효과: 높음 | 효과 0: 동등 | 기준 충족(균일·효과 0) | 과제별 효과까지 충족 |',
);
console.log('|---|---|---|---|---|---|');
let smallest: number | null = null;
let smallestHet: number | null = null;
for (const k of K_VALUES) {
  const base = { p1: models.p1, p2: models.p2, k, iterations: sims, alpha, delta, seed: seed + k };
  console.error(`K = ${k} 계산 중`);
  const up = rate(
    simulateVerdicts({ ...base, scenario: 'shift', shift: { p1: shift.p1, p2: shift.p2 } }),
    'higher',
  );
  const het = rate(
    simulateVerdicts({
      ...base,
      scenario: 'heterogeneous',
      shift: { p1: hetShift.p1, p2: hetShift.p2 },
    }),
    'higher',
  );
  const eq = rate(
    simulateVerdicts({ ...base, scenario: 'null', shift: { p1: 0, p2: 0 } }),
    'equivalent',
  );
  const ok = Math.min(...up, ...eq) >= TARGET;
  const okHet = ok && Math.min(...het) >= TARGET;
  if (ok && smallest === null) smallest = k;
  if (okHet && smallestHet === null) smallestHet = k;
  console.log(
    `| ${k} | ${cells(up)} | ${cells(het)} | ${cells(eq)} | ${ok ? '예' : '아니오'} | ${okHet ? '예' : '아니오'} |`,
  );
}

console.log();
console.log(
  smallest === null
    ? `K = 2..10 어느 값에서도 두 비율이 모두 ${TARGET} 이상이 되지 않는다. 설계 8.1의 5단계에 따라 후보 과제를 추가해 파일럿을 다시 한다.`
    : `두 비율(균일 효과의 높음, 효과 0의 동등)이 네 가설 모두 ${TARGET} 이상이 되는 가장 작은 반복 횟수: K = ${smallest}`,
);
console.log(
  smallestHet === null
    ? `과제별 효과의 높음 비율까지 ${TARGET} 이상인 K는 2..10에 없다.`
    : `과제별 효과의 높음 비율까지 ${TARGET} 이상이 되는 가장 작은 반복 횟수: K = ${smallestHet}`,
);
