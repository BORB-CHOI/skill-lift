/**
 * 통과율의 구간 추정.
 *
 * 표본이 수백 개 미만이면 정규 근사 구간은 실제보다 좁고, 통과율이 0이나 1이면 폭이 0이 된다
 * (Bowyer 외, arXiv:2503.01747). 그래서 Wilson 점수 구간을 쓴다.
 */

export interface Interval {
  readonly lower: number;
  readonly upper: number;
}

/** 95% 구간에 해당하는 표준정규 분위수. */
export const Z_95 = 1.959963984540054;

export function wilsonInterval(successes: number, trials: number, z: number = Z_95): Interval {
  if (!Number.isInteger(successes) || !Number.isInteger(trials)) {
    throw new RangeError('성공 수와 시행 수는 정수여야 한다');
  }
  if (trials <= 0 || successes < 0 || successes > trials) {
    throw new RangeError('0 <= 성공 수 <= 시행 수, 시행 수 > 0 이어야 한다');
  }
  const p = successes / trials;
  const z2 = z * z;
  const denominator = 1 + z2 / trials;
  const center = (p + z2 / (2 * trials)) / denominator;
  const half = (z / (2 * trials) / denominator) * Math.sqrt(4 * trials * p * (1 - p) + z2);
  // 통과율이 0이나 1이면 해당 경계는 수식상 정확히 0과 1이다. 부동소수 오차를 남기지 않는다.
  return {
    lower: successes === 0 ? 0 : Math.max(0, center - half),
    upper: successes === trials ? 1 : Math.min(1, center + half),
  };
}
