/**
 * 검출력 시뮬레이션 (설계 8.1의 2~4단계).
 *
 * 목적마다 glmm.ts로 맞춘 (μ, τ 상한)에서 과제를 뽑는다. 과제 i의 baseline 확률은
 * p_i = logistic(μ + u_i), u_i ~ N(0, τ²)이다. placebo는 baseline과 같은 분포다.
 * skill은 로짓 척도에서 c_i만큼 옮긴다.
 * - 'shift'(균일 효과): c_i = c. c는 모집단 평균 점수가 정확히 δ 오르도록 구적법으로 푼다.
 * - 'heterogeneous'(과제별 효과): c_i = c·(1 + W_i), W_i ~ N(0, 1). 과제마다 효과 크기와 방향이
 *   다르고, 평균 상승이 δ가 되도록 c를 푼다.
 * - 'null': c_i = 0.
 *
 * 과제·조건 점수는 K회 실행 × 항목 m개의 Bernoulli 평균, 즉 Binomial(Km, p)/(Km)이다.
 * 목적 1과 목적 2의 과제는 서로 독립으로 뽑는다(실제로 겹치는 과제의 상관은 넣지 않았다).
 * 판정은 decision.ts의 절차(Holm 4개 포함)를 그대로 쓴다.
 */
import { decideHypotheses, HYPOTHESES, type HypothesisId, type Verdict } from './decision.js';
import { gaussHermite, type Quadrature } from './glmm.js';
import { mulberry32 } from './paired.js';

export type Scenario = 'shift' | 'heterogeneous' | 'null';

export interface PurposeModel {
  readonly mu: number;
  readonly tau: number;
  /** 과제당 항목 수. */
  readonly items: number;
  /** 과제 수 N. */
  readonly tasks: number;
}

const logistic = (t: number): number => 1 / (1 + Math.exp(-t));

/** 효과 c에서 모집단 평균 점수가 오르는 양. heterogeneity = 0이면 균일 효과. */
export function meanLift(
  mu: number,
  tau: number,
  c: number,
  heterogeneity: number,
  quad: Quadrature = gaussHermite(),
): number {
  let sum = 0;
  quad.nodes.forEach((z, a) => {
    const base = logistic(mu + tau * z);
    const wa = quad.weights[a] ?? 0;
    if (heterogeneity === 0) {
      sum += wa * (logistic(mu + tau * z + c) - base);
      return;
    }
    quad.nodes.forEach((w, b) => {
      const shift = c * (1 + heterogeneity * w);
      sum += wa * (quad.weights[b] ?? 0) * (logistic(mu + tau * z + shift) - base);
    });
  });
  return sum;
}

/** 평균 상승이 delta가 되는 로짓 이동 c. 닿을 수 없으면 null. */
export function solveShift(
  mu: number,
  tau: number,
  delta: number,
  heterogeneity: number,
): number | null {
  const quad = gaussHermite();
  let lo = 0;
  let hi = 30;
  if (meanLift(mu, tau, hi, heterogeneity, quad) < delta) return null;
  while (hi - lo > 1e-9) {
    const mid = (lo + hi) / 2;
    if (meanLift(mu, tau, mid, heterogeneity, quad) < delta) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function normal(random: () => number): number {
  // Box–Muller. 0을 피하려고 1 − U를 쓴다.
  const u1 = 1 - random();
  const u2 = random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function binomialMean(trials: number, p: number, random: () => number): number {
  let hits = 0;
  for (let t = 0; t < trials; t++) if (random() < p) hits++;
  return hits / trials;
}

export interface SimulationInput {
  readonly p1: PurposeModel;
  readonly p2: PurposeModel;
  readonly k: number;
  readonly scenario: Scenario;
  /** 로짓 이동 c. scenario가 'null'이면 무시한다. 목적마다 따로 푼다. */
  readonly shift: { readonly p1: number; readonly p2: number };
  readonly iterations: number;
  readonly alpha: number;
  readonly delta: number;
  readonly seed: number;
}

export type VerdictRates = Record<HypothesisId, Record<Verdict, number>>;

function purposeDifferences(
  model: PurposeModel,
  k: number,
  c: number,
  heterogeneity: number,
  random: () => number,
): { versusBaseline: number[]; versusPlacebo: number[] } {
  const versusBaseline: number[] = [];
  const versusPlacebo: number[] = [];
  const trials = k * model.items;
  for (let i = 0; i < model.tasks; i++) {
    const eta = model.mu + model.tau * normal(random);
    const ci = heterogeneity === 0 ? c : c * (1 + heterogeneity * normal(random));
    const pBase = logistic(eta);
    const pSkill = logistic(eta + ci);
    const baseline = binomialMean(trials, pBase, random);
    const placebo = binomialMean(trials, pBase, random);
    const skill = binomialMean(trials, pSkill, random);
    versusBaseline.push(skill - baseline);
    versusPlacebo.push(skill - placebo);
  }
  return { versusBaseline, versusPlacebo };
}

/** 데이터셋을 iterations번 만들어 가설별 판정 비율을 낸다. */
export function simulateVerdicts(input: SimulationInput): VerdictRates {
  const random = mulberry32(input.seed);
  const heterogeneity = input.scenario === 'heterogeneous' ? 1 : 0;
  const c1 = input.scenario === 'null' ? 0 : input.shift.p1;
  const c2 = input.scenario === 'null' ? 0 : input.shift.p2;
  const counts = {} as VerdictRates;
  for (const spec of HYPOTHESES) {
    counts[spec.id] = { higher: 0, lower: 0, equivalent: 0, inconclusive: 0 };
  }
  for (let it = 0; it < input.iterations; it++) {
    const a = purposeDifferences(input.p1, input.k, c1, heterogeneity, random);
    const b = purposeDifferences(input.p2, input.k, c2, heterogeneity, random);
    const result = decideHypotheses(
      { H1: a.versusBaseline, H2: b.versusBaseline, H3: a.versusPlacebo, H4: b.versusPlacebo },
      { alpha: input.alpha, delta: input.delta, seed: input.seed, samples: 2_000 },
    );
    for (const spec of HYPOTHESES) counts[spec.id][result[spec.id].verdict]++;
  }
  for (const spec of HYPOTHESES) {
    const row = counts[spec.id];
    for (const v of Object.keys(row) as Verdict[]) row[v] /= input.iterations;
  }
  return counts;
}
