/**
 * 추정 대상 하나의 판정.
 *
 * 적용 순서(사전 등록):
 * 1. 개선·악화: Holm 보정을 거친 양측 부호 뒤집기 검정이 유의하면 평균 차이의 부호로 정한다.
 * 2. 동등: 아래 세 조건을 모두 충족할 때만 낸다.
 *    (가) ±δ만큼 옮긴 두 단측 검정이 모두 α/가설 수에서 유의하다.
 *    (나) 과제 단위 부트스트랩 (1 − 2α/가설 수) 구간 전체가 ±δ 안이다.
 *    (다) 대조 arm에 개선하거나 악화할 여지가 있다.
 * 3. 그 외는 판정 불가.
 *
 * "차이가 유의하지 않다"는 "차이가 없다"의 증거가 아니다. 그래서 동등은 별도 검정으로만 낸다.
 */
import { bcaInterval } from './bootstrap.js';
import type { Interval } from './intervals.js';
import { equivalencePValue, mean, signFlipPValue } from './paired.js';

export type Verdict = 'improved' | 'worsened' | 'equivalent' | 'inconclusive';

export type InconclusiveReason =
  /** 대조 arm이 천장이나 바닥에 붙어 차이가 날 여지가 없다. */
  | 'no-headroom'
  /** 동등 검정이 유의하지 않거나 구간이 ±δ를 벗어난다. */
  | 'not-equivalent'
  /** 이 추정 대상에는 동등 판정을 쓰지 않기로 사전 등록했다. */
  | 'equivalence-disabled';

export interface VerdictOptions {
  /** 가족 전체의 유의수준 (예: 0.05). */
  readonly alpha: number;
  /** 1차 가설의 수. Bonferroni 방식으로 동등 판정의 수준을 나눈다. */
  readonly hypotheses: number;
  /** Holm 보정을 적용한 뒤 이 가설의 차이 검정이 유의한지. 호출하는 쪽이 계산해 넘긴다. */
  readonly significant: boolean;
  /** 동등 한계 (통과율 차이의 절댓값). */
  readonly delta: number;
  /** 대조 arm 점수가 0도 1도 아닌 과제 수의 하한. */
  readonly minDiscriminating: number;
  /** 도달 가능성 검증을 통과한 추정 대상에만 true. */
  readonly equivalenceEnabled: boolean;
  readonly seed?: number;
}

export interface VerdictResult {
  readonly verdict: Verdict;
  readonly reason: InconclusiveReason | null;
  readonly meanDifference: number;
  /** 보정 전 양측 p값. */
  readonly pValue: number;
  /** 과제 단위 BCa 95% 구간. 보고용이다. */
  readonly interval95: Interval;
  readonly nonzeroDifferences: number;
  readonly headroom: {
    readonly controlMean: number;
    readonly discriminating: number;
    readonly ok: boolean;
  };
}

/** 대조 arm에 차이가 날 여지가 있는지. 처리 arm의 결과는 쓰지 않는다. */
export function hasHeadroom(
  controlScores: readonly number[],
  delta: number,
  minDiscriminating: number,
): VerdictResult['headroom'] {
  const controlMean = mean(controlScores);
  const discriminating = controlScores.filter((s) => s > 0 && s < 1).length;
  const ok =
    controlMean >= delta && controlMean <= 1 - delta && discriminating >= minDiscriminating;
  return { controlMean, discriminating, ok };
}

/**
 * @param differences 과제별 차이 (처리 − 대조)
 * @param controlScores 과제별 대조 arm 통과 비율
 */
export function decide(
  differences: readonly number[],
  controlScores: readonly number[],
  options: VerdictOptions,
): VerdictResult {
  if (differences.length !== controlScores.length) {
    throw new RangeError('차이와 대조 점수의 과제 수가 다르다');
  }
  const seed = options.seed ?? 1;
  const meanDifference = mean(differences);
  const base = {
    meanDifference,
    pValue: signFlipPValue(differences, 'two-sided', seed),
    interval95: bcaInterval(differences, 0.95, seed),
    nonzeroDifferences: differences.filter((d) => d !== 0).length,
    headroom: hasHeadroom(controlScores, options.delta, options.minDiscriminating),
  };

  if (options.significant && meanDifference !== 0) {
    return { ...base, verdict: meanDifference > 0 ? 'improved' : 'worsened', reason: null };
  }
  if (!options.equivalenceEnabled) {
    return { ...base, verdict: 'inconclusive', reason: 'equivalence-disabled' };
  }
  if (!base.headroom.ok) {
    return { ...base, verdict: 'inconclusive', reason: 'no-headroom' };
  }

  const level = options.alpha / options.hypotheses;
  const tostSignificant = equivalencePValue(differences, options.delta, seed) <= level;
  const interval = bcaInterval(differences, 1 - 2 * level, seed);
  const intervalInside = interval.lower >= -options.delta && interval.upper <= options.delta;
  if (tostSignificant && intervalInside) {
    return { ...base, verdict: 'equivalent', reason: null };
  }
  return { ...base, verdict: 'inconclusive', reason: 'not-equivalent' };
}
