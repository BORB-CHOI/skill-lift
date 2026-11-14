/**
 * 부호 뒤집기 검정을 뒤집어 만든 평균 차이의 신뢰구간 (설계 8절의 주 구간).
 *
 * 구간은 {θ : 양측 부호 뒤집기 검정의 p(d − θ) > α}다. θ = 평균(d)에서 관측 합이 0이라 p = 1이고,
 * θ가 평균에서 멀어질수록 p가 줄어든다. 양쪽 경계를 각각 이분법으로 찾는다.
 * p(θ)는 계단 함수라서 경계는 허용 오차 안의 근삿값이다.
 *
 * n <= 20이면 정확 열거, 그보다 많으면 시드를 고정한 몬테카를로를 쓴다. 이분법의 모든 단계에
 * 같은 시드를 써서 θ마다 같은 부호 표본을 비교한다.
 *
 * 과제가 너무 적어 가능한 최소 p값(2/2^n)이 α보다 크면 해당 쪽 경계가 없다. 그때는 ±Infinity를 낸다.
 */
import type { Interval } from './intervals.js';
import { mean } from './paired.js';
import { fastSignFlipPValue, type SignFlipOptions } from './signflip.js';

export interface InversionOptions extends SignFlipOptions {
  /** 경계의 허용 오차 (차이 척도). 기본 1e-6. */
  readonly tolerance?: number;
}

function accepted(
  differences: readonly number[],
  theta: number,
  alpha: number,
  options: SignFlipOptions,
): boolean {
  const shifted = differences.map((d) => d - theta);
  return fastSignFlipPValue(shifted, 'two-sided', options) > alpha;
}

/** inside는 받아들여지는 θ, outside는 기각되는 θ. 두 값 사이의 경계를 찾는다. */
function bisect(
  differences: readonly number[],
  inside: number,
  outside: number,
  alpha: number,
  options: InversionOptions,
): number {
  const tolerance = options.tolerance ?? 1e-6;
  let inner = inside;
  let outer = outside;
  while (Math.abs(outer - inner) > tolerance) {
    const middle = (inner + outer) / 2;
    if (accepted(differences, middle, alpha, options)) inner = middle;
    else outer = middle;
  }
  return (inner + outer) / 2;
}

/**
 * 평균 차이의 (1 − α) 신뢰구간.
 * @param differences 과제별 차이 (처리 − 대조)
 * @param alpha 양측 유의수준 (예: 0.05 → 95% 구간)
 */
export function signFlipInterval(
  differences: readonly number[],
  alpha = 0.05,
  options: InversionOptions = {},
): Interval {
  if (differences.length === 0) throw new RangeError('과제가 하나도 없다');
  if (!(alpha > 0 && alpha < 1)) throw new RangeError('α는 0과 1 사이여야 한다');
  const center = mean(differences);
  const span = Math.max(...differences) - Math.min(...differences) + 1;
  // θ가 모든 차이보다 작거나 크면 이동한 차이의 부호가 전부 같아져 p가 최소가 된다.
  const below = Math.min(...differences) - span;
  const above = Math.max(...differences) + span;
  const lower = accepted(differences, below, alpha, options)
    ? -Infinity
    : bisect(differences, center, below, alpha, options);
  const upper = accepted(differences, above, alpha, options)
    ? Infinity
    : bisect(differences, center, above, alpha, options);
  return { lower, upper };
}
