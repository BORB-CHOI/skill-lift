/**
 * 분석 절차 자체의 검증.
 *
 * 판정 규칙이 차이 없는 데이터에서 "개선"이나 "악화"를 과도하게 내지 않는지(반분 재표집),
 * 실제 차이가 있을 때 얼마나 잡아내는지(검출력 곡선)를 저장된 대조 arm 실행만으로 측정한다.
 * 에이전트를 다시 실행하지 않는다.
 */
import { holm, mean, mulberry32, signFlipPValue } from './paired.js';

/** 과제별 대조 arm 실행 점수(0 또는 1). 과제마다 2K개가 있다고 가정한다. */
export type RunMatrix = readonly (readonly number[])[];

function shuffled(values: readonly number[], random: () => number): number[] {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = out[i];
    const b = out[j];
    if (a !== undefined && b !== undefined) {
      out[i] = b;
      out[j] = a;
    }
  }
  return out;
}

function significant(differences: readonly number[], alpha: number, hypotheses: number): boolean {
  if (differences.every((d) => d === 0)) return false;
  const p = signFlipPValue(differences);
  return holm([p, ...Array.from({ length: hypotheses - 1 }, () => 1)], alpha)[0] ?? false;
}

export interface SplitHalfResult {
  readonly iterations: number;
  /** "개선" 또는 "악화"로 판정된 비율. 차이 없는 데이터이므로 낮아야 한다. */
  readonly falseVerdictRate: number;
}

/**
 * 반분 재표집. 과제마다 대조 arm 실행을 무작위로 반씩 나눠 한쪽을 처리, 다른 쪽을 대조로 보고
 * 판정을 반복한다. 분할들이 같은 실행에서 나와 서로 종속이므로 거짓 양성률의 추정치가 아니라
 * 판정 절차의 구현 검증으로 쓴다.
 */
export function splitHalf(
  runs: RunMatrix,
  iterations: number,
  alpha: number,
  hypotheses: number,
  seed = 1,
): SplitHalfResult {
  const random = mulberry32(seed);
  let flagged = 0;
  for (let it = 0; it < iterations; it++) {
    const differences = runs.map((taskRuns) => {
      const order = shuffled(taskRuns, random);
      const half = Math.floor(order.length / 2);
      return mean(order.slice(0, half)) - mean(order.slice(half, 2 * half));
    });
    if (significant(differences, alpha, hypotheses)) flagged++;
  }
  return { iterations, falseVerdictRate: flagged / iterations };
}

export interface PowerPoint {
  /** 주입한 효과의 크기(통과율 차이, pp/100). */
  readonly strength: number;
  /** 주입한 방향으로 판정된 비율. */
  readonly detectionRate: number;
}

/**
 * 검출력 곡선. 대조는 실행 1~K, 처리는 실행 K+1~2K의 사본을 쓰고, 처리 쪽에 오염을 주입한다.
 * 개선 방향은 실패를 통과로, 악화 방향은 통과를 실패로 각 실행마다 strength의 확률로 바꾼다.
 * 같은 실행을 양쪽에 쓰면 실행 간 변동이 사라져 검출력이 실제보다 높게 나온다.
 */
export function powerCurve(
  runs: RunMatrix,
  k: number,
  strengths: readonly number[],
  direction: 'improve' | 'worsen',
  iterations: number,
  alpha: number,
  hypotheses: number,
  seed = 1,
): PowerPoint[] {
  const random = mulberry32(seed);
  return strengths.map((strength) => {
    let detected = 0;
    for (let it = 0; it < iterations; it++) {
      const differences = runs.map((taskRuns) => {
        const control = taskRuns.slice(0, k);
        const treated = taskRuns.slice(k, 2 * k).map((score) => {
          const flip = random() < strength;
          if (!flip) return score;
          if (direction === 'improve') return 1;
          return 0;
        });
        return mean(treated) - mean(control);
      });
      if (!significant(differences, alpha, hypotheses)) continue;
      const m = mean(differences);
      if ((direction === 'improve' && m > 0) || (direction === 'worsen' && m < 0)) detected++;
    }
    return { strength, detectionRate: detected / iterations };
  });
}
