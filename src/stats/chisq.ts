/**
 * 카이제곱 분포의 누적분포와 분위수.
 *
 * 누적분포는 정규화된 하부 불완전 감마 함수 P(k/2, x/2)다. x < a + 1이면 급수, 아니면 연분수
 * (수정 Lentz)로 계산한다 (Numerical Recipes 6.2의 gser, gcf). 분위수는 이분법으로 찾는다.
 */

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
] as const;

/** ln Γ(x), Lanczos 근사 (g = 7, 계수 9개). */
export function logGamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  const z = x - 1;
  let a = LANCZOS[0];
  for (let i = 1; i < LANCZOS.length; i++) a += (LANCZOS[i] ?? 0) / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

const EPS = 1e-15;
const TINY = 1e-300;

/** 정규화된 하부 불완전 감마 P(a, x). */
export function regularizedGammaP(a: number, x: number): number {
  if (!(a > 0)) throw new RangeError('a는 양수여야 한다');
  if (x <= 0) return 0;
  const front = Math.exp(-x + a * Math.log(x) - logGamma(a));
  if (x < a + 1) {
    let ap = a;
    let del = 1 / a;
    let total = del;
    for (let i = 0; i < 10_000; i++) {
      ap += 1;
      del *= x / ap;
      total += del;
      if (Math.abs(del) < Math.abs(total) * EPS) break;
    }
    return total * front;
  }
  let b = x + 1 - a;
  let c = 1 / TINY;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 10_000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < TINY) d = TINY;
    c = b + an / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return 1 - front * h;
}

export const chi2Cdf = (x: number, df: number): number => regularizedGammaP(df / 2, x / 2);

/** 자유도 df인 카이제곱 분포의 p 분위수. */
export function chi2Quantile(p: number, df: number): number {
  if (!(p > 0 && p < 1)) throw new RangeError('확률은 0과 1 사이여야 한다');
  if (!(df > 0)) throw new RangeError('자유도는 양수여야 한다');
  let lo = 0;
  let hi = Math.max(10, df);
  while (chi2Cdf(hi, df) < p) hi *= 2;
  for (let i = 0; i < 200 && hi - lo > 1e-12 * Math.max(1, hi); i++) {
    const mid = (lo + hi) / 2;
    if (chi2Cdf(mid, df) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
