/**
 * 부호 뒤집기 검정의 빠른 계산.
 *
 * paired.ts의 signFlipPValue와 같은 검정이고 같은 값을 낸다. 차이는 계산 방법뿐이다.
 * - n <= 20: 반분 열거(meet-in-the-middle). 앞쪽 절반과 뒤쪽 절반의 부호 조합 합을 따로 만들고,
 *   한쪽을 정렬해 이분 탐색으로 극단 조합 수를 센다. 2^n 대신 2^(n/2)·log 규모라서
 *   구간 역산과 검출력 시뮬레이션처럼 p값을 수만 번 부르는 곳에 쓴다.
 * - n > 20: signFlipPValue와 같은 난수 순서의 시드 고정 몬테카를로. 표본 수를 줄일 수 있다.
 */
import { mulberry32, type Tail } from './paired.js';

const EXACT_LIMIT = 20;
/** signFlipPValue의 표본 수와 같다. 이 값이면 두 함수의 결과가 일치한다. */
export const DEFAULT_MC_SAMPLES = 200_000;
/** signFlipPValue와 같은 부동소수 허용치. */
const EPSILON = 1e-12;

export interface SignFlipOptions {
  readonly seed?: number;
  /** n > 20일 때 몬테카를로 표본 수. */
  readonly samples?: number;
}

function subsetSums(values: readonly number[]): number[] {
  let sums = [0];
  for (const v of values) {
    const next = new Array<number>(sums.length * 2);
    for (let i = 0; i < sums.length; i++) {
      const s = sums[i] ?? 0;
      next[2 * i] = s + v;
      next[2 * i + 1] = s - v;
    }
    sums = next;
  }
  return sums;
}

/** 정렬된 배열에서 x 이상인 첫 위치. */
function lowerBound(sorted: Float64Array, x: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((sorted[mid] ?? 0) < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** 정렬된 배열에서 x 초과인 첫 위치. */
function upperBound(sorted: Float64Array, x: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((sorted[mid] ?? 0) <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function exactPValue(differences: readonly number[], tail: Tail): number {
  const n = differences.length;
  let observed = 0;
  for (const d of differences) observed += d;
  const half = Math.floor(n / 2);
  const left = subsetSums(differences.slice(0, half));
  const right = Float64Array.from(subsetSums(differences.slice(half)));
  right.sort();
  const total = left.length * right.length;

  let extreme = 0;
  if (tail === 'two-sided') {
    const threshold = Math.abs(observed) - EPSILON;
    if (threshold <= 0) return 1;
    for (const a of left) {
      extreme += right.length - lowerBound(right, threshold - a);
      extreme += upperBound(right, -threshold - a);
    }
  } else if (tail === 'greater') {
    const threshold = observed - EPSILON;
    for (const a of left) extreme += right.length - lowerBound(right, threshold - a);
  } else {
    const threshold = observed + EPSILON;
    for (const a of left) extreme += upperBound(right, threshold - a);
  }
  return extreme / total;
}

function isExtreme(stat: number, observed: number, tail: Tail): boolean {
  switch (tail) {
    case 'two-sided':
      return Math.abs(stat) >= Math.abs(observed) - EPSILON;
    case 'greater':
      return stat >= observed - EPSILON;
    case 'less':
      return stat <= observed + EPSILON;
  }
}

function monteCarloPValue(
  differences: readonly number[],
  tail: Tail,
  seed: number,
  samples: number,
): number {
  let observed = 0;
  for (const d of differences) observed += d;
  const random = mulberry32(seed);
  let extreme = 1; // 관측값 자신을 포함한다
  for (let s = 0; s < samples; s++) {
    let stat = 0;
    for (const d of differences) stat += random() < 0.5 ? -d : d;
    if (isExtreme(stat, observed, tail)) extreme++;
  }
  return extreme / (samples + 1);
}

/** 부호 뒤집기 검정 p값. signFlipPValue와 같은 값을 더 빨리 낸다. */
export function fastSignFlipPValue(
  differences: readonly number[],
  tail: Tail = 'two-sided',
  options: SignFlipOptions = {},
): number {
  if (differences.length === 0) throw new RangeError('과제가 하나도 없다');
  if (differences.length <= EXACT_LIMIT) return exactPValue(differences, tail);
  return monteCarloPValue(
    differences,
    tail,
    options.seed ?? 1,
    options.samples ?? DEFAULT_MC_SAMPLES,
  );
}

/**
 * TOST 동등 검정 p값. d + δ > 0 단측 검정과 d − δ < 0 단측 검정의 p값 중 큰 쪽이다.
 * paired.ts의 equivalencePValue와 같은 정의다.
 */
export function fastEquivalencePValue(
  differences: readonly number[],
  delta: number,
  options: SignFlipOptions = {},
): number {
  if (!(delta > 0)) throw new RangeError('δ는 양수여야 한다');
  const lower = fastSignFlipPValue(
    differences.map((d) => d + delta),
    'greater',
    options,
  );
  const upper = fastSignFlipPValue(
    differences.map((d) => d - delta),
    'less',
    options,
  );
  return Math.max(lower, upper);
}
