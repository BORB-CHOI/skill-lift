/**
 * 반복 횟수 K를 정하는 검출력 시뮬레이션.
 *
 * 1. (프로젝트, 모델)마다 파일럿 실행 점수의 표준편차를 조건별 편차로 합쳐(pooled) 추정하고,
 *    카이제곱 분포로 95% 상한을 잡는다: SD_상한 = sqrt(df·s² / χ²_{0.05, df}).
 * 2. 실행 점수 모형은 베타-이항이다. 실행마다 통과 확률 π ~ Beta(평균 μ, 실행 간 상관 ρ)를 뽑고
 *    항목 m개를 Bernoulli(π)로 채점한다. 점수는 통과 수 / m이라 실제 점수처럼 0..1의 이산값이다.
 *    분산은 μ(1 − μ)(1 + (m − 1)ρ) / m이고, μ = baseline 평균에서 이 값이 SD_상한²이 되게 ρ를 푼다.
 * 3. 효과 시나리오: baseline과 placebo는 평균 μ, skill은 μ + δ (ρ는 같다). 두 가설의 참 차이가 δ다.
 *    효과 0 시나리오: 세 조건 모두 평균 μ.
 * 4. 데이터셋마다 8개 가설 전체에 보고서와 같은 판정(순열 검정, TOST, Holm 8개)을 적용한다.
 *    p값은 정확 순열 분포로 낸다(permutation.ts의 정수 표). 본 분석은 C(2K, K) > 200,000이면
 *    몬테카를로 200,000회를 쓰는데, 그 오차(유의수준 근처 표준오차 약 0.0002)는 판정에 거의
 *    영향이 없어 시뮬레이션은 정확값으로 대신한다.
 */
import { chi2Quantile } from './chisq.js';
import { decideFromPValues, hypothesisKey, type PValueRow, type Verdict } from './decision.js';
import { mean, mulberry32 } from './paired.js';
import { gridTables, gridTests, integerSubsetCounts } from './permutation.js';

export interface PooledSd {
  readonly sd: number;
  readonly df: number;
}

/** 조건별 평균에서 잰 편차를 합친 표준편차. 자유도는 Σ(n_조건 − 1). 자유도가 0이면 null. */
export function pooledSd(groups: readonly (readonly number[])[]): PooledSd | null {
  let ss = 0;
  let df = 0;
  for (const g of groups) {
    if (g.length < 2) continue;
    const m = mean(g);
    for (const v of g) ss += (v - m) ** 2;
    df += g.length - 1;
  }
  return df === 0 ? null : { sd: Math.sqrt(ss / df), df };
}

/** 표준편차의 단측 상한. 정규 가정 아래 df·s²/σ² ~ χ²_df. */
export function sdUpperBound(sd: number, df: number, confidence = 0.95): number {
  return Math.sqrt((df * sd * sd) / chi2Quantile(1 - confidence, df));
}

export interface Dispersion {
  /** 실행 간 상관 ρ (0..1). */
  readonly rho: number;
  /** 이 ρ에서 평균 μ의 실제 표준편차. 목표에 닿지 못하면 목표와 다르다. */
  readonly achievedSd: number;
  /** 목표 표준편차가 이항 분산보다 작거나(floor) Bernoulli 분산보다 커서(ceiling) ρ를 잘랐는지. */
  readonly clamped: 'floor' | 'ceiling' | null;
}

export function betaBinomialSd(mu: number, items: number, rho: number): number {
  return Math.sqrt((mu * (1 - mu) * (1 + (items - 1) * rho)) / items);
}

/** 평균 μ, 항목 m개에서 표준편차가 sd가 되는 ρ. */
export function fitDispersion(mu: number, items: number, sd: number): Dispersion {
  const base = mu * (1 - mu);
  if (base === 0 || items === 1) {
    return {
      rho: 0,
      achievedSd: Math.sqrt(base),
      clamped: sd > Math.sqrt(base) ? 'ceiling' : null,
    };
  }
  const raw = ((sd * sd * items) / base - 1) / (items - 1);
  const rho = Math.min(1, Math.max(0, raw));
  return {
    rho,
    achievedSd: betaBinomialSd(mu, items, rho),
    clamped: raw < 0 ? 'floor' : raw > 1 ? 'ceiling' : null,
  };
}

/**
 * 시뮬레이션에 쓸 baseline 평균. skill 평균 μ + δ가 1을 넘지 않게 1 − δ로 자르고, 목표 분산에
 * 닿을 수 있게 μ(1 − μ) >= sd²인 가장 작은 μ 아래로 내려가지 않게 한다.
 */
export function simulationMean(observed: number, sd: number, delta: number): number {
  const low = (1 - Math.sqrt(Math.max(0, 1 - 4 * sd * sd))) / 2;
  return Math.min(Math.max(observed, low), 1 - delta);
}

export interface CellModel {
  readonly project: string;
  readonly model: string;
  readonly items: number;
  /** 시뮬레이션의 baseline 평균 μ. */
  readonly mu: number;
  readonly rho: number;
}

function normal(random: () => number): number {
  // Box–Muller. 0을 피하려고 1 − U를 쓴다.
  return Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
}

/** Gamma(shape, 1). Marsaglia–Tsang. shape < 1은 Gamma(shape + 1)·U^(1/shape). */
function gamma(shape: number, random: () => number): number {
  if (shape < 1) return gamma(shape + 1, random) * (1 - random()) ** (1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    const x = normal(random);
    const v = (1 + c * x) ** 3;
    if (v <= 0) continue;
    const u = 1 - random();
    if (Math.log(u) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v;
  }
}

/** 베타-이항으로 실행 하나의 통과 항목 수를 뽑는다. */
export function drawPasses(mu: number, rho: number, items: number, random: () => number): number {
  let p: number;
  if (mu <= 0 || mu >= 1 || rho <= 0) p = mu;
  else if (rho >= 1) p = random() < mu ? 1 : 0;
  else {
    const scale = (1 - rho) / rho;
    const a = gamma(mu * scale, random);
    const b = gamma((1 - mu) * scale, random);
    p = a / (a + b);
  }
  let passes = 0;
  for (let i = 0; i < items; i++) if (random() < p) passes++;
  return passes;
}

export type Scenario = 'effect' | 'null';

export interface PowerInput {
  /** 가설 묶음 순서(프로젝트 → 모델)의 셀. 셀마다 baseline, placebo 가설 두 개다. */
  readonly cells: readonly CellModel[];
  readonly k: number;
  readonly scenario: Scenario;
  readonly iterations: number;
  readonly alpha: number;
  readonly delta: number;
  readonly seed: number;
}

/** 가설 키(hypothesisKey) → 판정별 비율. */
export type VerdictRates = Record<string, Record<Verdict, number>>;

export function simulatePower(input: PowerInput): VerdictRates {
  const random = mulberry32(input.seed);
  const keys = input.cells.flatMap((cell) =>
    (['baseline', 'placebo'] as const).map((control) =>
      hypothesisKey({ project: cell.project, model: cell.model, control }),
    ),
  );
  const counts: VerdictRates = {};
  for (const key of keys) counts[key] = { higher: 0, lower: 0, equivalent: 0, inconclusive: 0 };
  const lift = input.scenario === 'effect' ? input.delta : 0;
  for (let it = 0; it < input.iterations; it++) {
    const rows: PValueRow[] = [];
    for (const cell of input.cells) {
      const draw = (mu: number): number[] =>
        Array.from({ length: input.k }, () => drawPasses(mu, cell.rho, cell.items, random));
      const baseline = draw(cell.mu);
      const placebo = draw(cell.mu);
      const skill = draw(cell.mu + lift);
      const table = integerSubsetCounts(skill, input.k, input.k * cell.items + 1);
      for (const control of [baseline, placebo]) {
        rows.push(gridTests(gridTables(skill, control, cell.items, table), input.delta));
      }
    }
    decideFromPValues(rows, input.alpha).forEach((d, i) => {
      const row = counts[keys[i] ?? ''];
      if (row !== undefined) row[d.verdict]++;
    });
  }
  for (const key of keys) {
    const row = counts[key];
    if (row === undefined) continue;
    for (const v of Object.keys(row) as Verdict[]) row[v] /= input.iterations;
  }
  return counts;
}
