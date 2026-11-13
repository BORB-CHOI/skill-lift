/**
 * 과제 단위 BCa 부트스트랩 구간.
 *
 * 재표집 단위는 실행이 아니라 과제다. 과제별 차이를 복원 추출해 평균의 분포를 만든다.
 * 소표본에서는 이 구간이 실제보다 좁게 나오는 경향이 있다 (Bowyer 외, arXiv:2503.01747).
 * 그래서 판정은 정확 검정으로 하고 이 구간은 보고와 동등 판정의 두 번째 조건으로만 쓴다.
 */
import type { Interval } from './intervals.js';
import { mean, mulberry32 } from './paired.js';

const DEFAULT_RESAMPLES = 10_000;

/** 표준정규 누적분포 (Abramowitz–Stegun 7.1.26, 절대 오차 1.5e-7 이하). */
export function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const poly =
    t *
    (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

/** 표준정규 분위수 (Acklam의 유리 근사, 상대 오차 1.15e-9 이하). */
export function normalQuantile(p: number): number {
  if (!(p > 0 && p < 1)) throw new RangeError('확률은 0과 1 사이여야 한다');
  const a = [
    -39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716,
    2.506628277459239,
  ] as const;
  const b = [
    -54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972,
    -13.28068155288572,
  ] as const;
  const c = [
    -0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734,
    4.374664141464968, 2.938163982698783,
  ] as const;
  const d = [
    0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416,
  ] as const;
  const low = 0.02425;
  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (p > 1 - low) return -normalQuantile(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return (
    ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  );
}

function quantileOfSorted(sorted: readonly number[], p: number): number {
  const clamped = Math.min(1, Math.max(0, p));
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(clamped * sorted.length)));
  return sorted[index] ?? NaN;
}

/** 잭나이프로 추정한 가속 상수. 분산이 0이면 0. */
function acceleration(values: readonly number[]): number {
  const n = values.length;
  const total = values.reduce((sum, v) => sum + v, 0);
  const leaveOneOut = values.map((v) => (total - v) / (n - 1));
  const center = mean(leaveOneOut);
  let cubed = 0;
  let squared = 0;
  for (const theta of leaveOneOut) {
    const diff = center - theta;
    cubed += diff ** 3;
    squared += diff ** 2;
  }
  return squared === 0 ? 0 : cubed / (6 * squared ** 1.5);
}

/**
 * 과제별 차이의 평균에 대한 BCa 구간.
 * @param confidence 신뢰수준 (예: 0.95)
 */
export function bcaInterval(
  differences: readonly number[],
  confidence: number,
  seed = 1,
  resamples = DEFAULT_RESAMPLES,
): Interval {
  const n = differences.length;
  if (n < 2) throw new RangeError('부트스트랩에는 과제가 2개 이상 필요하다');
  if (!(confidence > 0 && confidence < 1)) throw new RangeError('신뢰수준은 0과 1 사이여야 한다');

  const observed = mean(differences);
  const random = mulberry32(seed);
  const stats: number[] = [];
  let below = 0;
  for (let r = 0; r < resamples; r++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += differences[Math.floor(random() * n)] ?? 0;
    const stat = sum / n;
    stats.push(stat);
    if (stat < observed) below++;
  }
  stats.sort((x, y) => x - y);

  const tail = (1 - confidence) / 2;
  // 재표집 평균이 전부 관측값 한쪽에 몰리면 편향 보정을 계산할 수 없다. 백분위 구간으로 낸다.
  if (below === 0 || below === resamples) {
    return { lower: quantileOfSorted(stats, tail), upper: quantileOfSorted(stats, 1 - tail) };
  }
  const z0 = normalQuantile(below / resamples);
  const accel = acceleration(differences);
  const adjust = (z: number): number => normalCdf(z0 + (z0 + z) / (1 - accel * (z0 + z)));
  return {
    lower: quantileOfSorted(stats, adjust(normalQuantile(tail))),
    upper: quantileOfSorted(stats, adjust(normalQuantile(1 - tail))),
  };
}
