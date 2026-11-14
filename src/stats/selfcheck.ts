/**
 * 판정 절차 자체의 검증 (설계 8.2). 본 실행의 baseline 실행만 쓴다.
 *
 * - 반분 재표집: 과제마다 baseline 실행을 무작위로 반씩 나눠 한쪽을 처리, 다른 쪽을 대조로 본다.
 *   차이가 없는 데이터에서 높음·낮음이 나오는 비율을 센다. 분할끼리 독립이 아니므로
 *   오판정률의 추정치가 아니라 구현 확인용이다.
 * - 검출력 곡선: 같은 분할에서 처리 쪽 항목 점수 0을 확률 s로 1로 바꿔 차이를 넣고,
 *   높음이 나오는 비율을 센다.
 *
 * 판정은 decision.ts의 절차를 그대로 쓴다. 검증 대상 가설 하나만 데이터를 넣고 나머지 세 가설은
 * 과제 없이(p = 1) 넣어 Holm 4개 보정을 유지한다.
 */
import { decideHypotheses, type HypothesisId } from './decision.js';
import { mean, mulberry32 } from './paired.js';

/** 과제 → 실행 → 항목 점수(0 또는 1). */
export type ItemRuns = readonly (readonly (readonly number[])[])[];

function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = out[i] as T;
    out[i] = out[j] as T;
    out[j] = a;
  }
  return out;
}

const runMean = (items: readonly number[]): number => (items.length === 0 ? 0 : mean(items));

function verdictFor(
  differences: readonly number[],
  alpha: number,
  delta: number,
): 'higher' | 'lower' | 'equivalent' | 'inconclusive' {
  const input: Record<HypothesisId, readonly number[]> = {
    H1: differences,
    H2: [],
    H3: [],
    H4: [],
  };
  return decideHypotheses(input, { alpha, delta }).H1.verdict;
}

/** 실행이 2개 이상인 과제만 쓴다. 홀수면 남는 실행 하나를 버린다. */
function usable(runs: ItemRuns): ItemRuns {
  return runs.filter((taskRuns) => taskRuns.length >= 2);
}

export interface SplitHalfSummary {
  readonly tasks: number;
  readonly iterations: number;
  /** 높음 또는 낮음으로 판정된 비율. */
  readonly directionalRate: number;
  /** 동등으로 판정된 비율 (참고). */
  readonly equivalentRate: number;
}

export function splitHalfCheck(
  runs: ItemRuns,
  iterations: number,
  alpha: number,
  delta: number,
  seed = 1,
): SplitHalfSummary {
  const tasks = usable(runs);
  const random = mulberry32(seed);
  let directional = 0;
  let equivalent = 0;
  for (let it = 0; it < iterations; it++) {
    const d = tasks.map((taskRuns) => {
      const order = shuffle(taskRuns, random);
      const half = Math.floor(order.length / 2);
      const a = order.slice(0, half).map(runMean);
      const b = order.slice(half, 2 * half).map(runMean);
      return mean(a) - mean(b);
    });
    if (d.length === 0) break;
    const verdict = verdictFor(d, alpha, delta);
    if (verdict === 'higher' || verdict === 'lower') directional++;
    if (verdict === 'equivalent') equivalent++;
  }
  return {
    tasks: tasks.length,
    iterations,
    directionalRate: tasks.length === 0 ? 0 : directional / iterations,
    equivalentRate: tasks.length === 0 ? 0 : equivalent / iterations,
  };
}

export interface InjectedPowerPoint {
  /** 처리 쪽 항목 점수 0을 1로 바꾸는 확률. */
  readonly strength: number;
  /** 실제로 들어간 평균 차이(반복 평균). */
  readonly injectedDifference: number;
  /** 높음으로 판정된 비율. */
  readonly detectionRate: number;
}

export function injectedPowerCurve(
  runs: ItemRuns,
  strengths: readonly number[],
  iterations: number,
  alpha: number,
  delta: number,
  seed = 2,
): InjectedPowerPoint[] {
  const tasks = usable(runs);
  const random = mulberry32(seed);
  return strengths.map((strength) => {
    let detected = 0;
    let injected = 0;
    for (let it = 0; it < iterations; it++) {
      const d = tasks.map((taskRuns) => {
        const order = shuffle(taskRuns, random);
        const half = Math.floor(order.length / 2);
        const control = order.slice(0, half).map(runMean);
        const treated = order
          .slice(half, 2 * half)
          .map((items) => runMean(items.map((s) => (s === 0 && random() < strength ? 1 : s))));
        return mean(treated) - mean(control);
      });
      if (d.length === 0) break;
      injected += mean(d);
      if (verdictFor(d, alpha, delta) === 'higher') detected++;
    }
    return {
      strength,
      injectedDifference: tasks.length === 0 ? 0 : injected / iterations,
      detectionRate: tasks.length === 0 ? 0 : detected / iterations,
    };
  });
}
