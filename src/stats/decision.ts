/**
 * H1~H4 판정과 결론 대응표 (설계 2절, 2.1절, 8절).
 *
 * 가설마다 과제별 차이(skill − 대조)에 아래를 계산한다.
 * 1. 차이 검정: 양측 부호 뒤집기 p값.
 * 2. 동등 검정: TOST p값. d + δ > 0과 d − δ < 0 두 단측 부호 뒤집기 검정 중 큰 p값.
 * 3. Holm 보정을 차이 p값 4개와 동등 p값 4개에 따로 적용한다(전체 α).
 * 4. 판정: 차이가 유의하면 평균 차이의 부호로 높음·낮음, 아니면 동등이 유의할 때 동등,
 *    둘 다 아니면 판정 불가. 차이가 유의하면 동등보다 먼저 쓴다.
 */
import { holm, mean } from './paired.js';
import { fastEquivalencePValue, fastSignFlipPValue, type SignFlipOptions } from './signflip.js';

export type HypothesisId = 'H1' | 'H2' | 'H3' | 'H4';
export type Purpose = 'p1' | 'p2';
export type ControlArm = 'baseline' | 'placebo';
export type Verdict = 'higher' | 'lower' | 'equivalent' | 'inconclusive';

export interface HypothesisSpec {
  readonly id: HypothesisId;
  readonly purpose: Purpose;
  readonly control: ControlArm;
}

/** 설계 2절의 가설 표. 처리 조건은 모두 skill이다. */
export const HYPOTHESES: readonly HypothesisSpec[] = [
  { id: 'H1', purpose: 'p1', control: 'baseline' },
  { id: 'H2', purpose: 'p2', control: 'baseline' },
  { id: 'H3', purpose: 'p1', control: 'placebo' },
  { id: 'H4', purpose: 'p2', control: 'placebo' },
];

export interface DecisionOptions extends SignFlipOptions {
  readonly alpha: number;
  readonly delta: number;
}

export interface HypothesisResult {
  readonly id: HypothesisId;
  readonly n: number;
  readonly meanDifference: number;
  /** 보정 전 양측 차이 검정 p값. */
  readonly pDifference: number;
  /** Holm 조정 p값 (차이 검정 4개 안에서). */
  readonly pDifferenceAdjusted: number;
  /** 보정 전 TOST p값. */
  readonly pEquivalence: number;
  /** Holm 조정 p값 (동등 검정 4개 안에서). */
  readonly pEquivalenceAdjusted: number;
  readonly differenceSignificant: boolean;
  readonly equivalenceSignificant: boolean;
  readonly verdict: Verdict;
}

/** Holm 조정 p값. 순서대로 (m − rank)·p의 누적 최댓값이고 1을 넘지 않는다. */
export function holmAdjusted(pValues: readonly number[]): number[] {
  const m = pValues.length;
  const order = pValues.map((p, index) => ({ p, index })).sort((a, b) => a.p - b.p);
  const adjusted = new Array<number>(m).fill(1);
  let running = 0;
  order.forEach((item, rank) => {
    running = Math.max(running, Math.min(1, (m - rank) * item.p));
    adjusted[item.index] = running;
  });
  return adjusted;
}

/**
 * 네 가설을 함께 판정한다. 과제가 하나도 없는 가설은 p = 1로 넣어 판정 불가가 된다.
 */
export function decideHypotheses(
  differences: Readonly<Record<HypothesisId, readonly number[]>>,
  options: DecisionOptions,
): Record<HypothesisId, HypothesisResult> {
  const rows = HYPOTHESES.map((spec) => {
    const d = differences[spec.id];
    if (d.length === 0) return { spec, d, pDiff: 1, pEq: 1, m: 0 };
    return {
      spec,
      d,
      pDiff: fastSignFlipPValue(d, 'two-sided', options),
      pEq: fastEquivalencePValue(d, options.delta, options),
      m: mean(d),
    };
  });
  const diffRejected = holm(
    rows.map((r) => r.pDiff),
    options.alpha,
  );
  const eqRejected = holm(
    rows.map((r) => r.pEq),
    options.alpha,
  );
  const diffAdjusted = holmAdjusted(rows.map((r) => r.pDiff));
  const eqAdjusted = holmAdjusted(rows.map((r) => r.pEq));

  const out = {} as Record<HypothesisId, HypothesisResult>;
  rows.forEach((row, i) => {
    const differenceSignificant = (diffRejected[i] ?? false) && row.m !== 0;
    const equivalenceSignificant = eqRejected[i] ?? false;
    let verdict: Verdict = 'inconclusive';
    if (differenceSignificant) verdict = row.m > 0 ? 'higher' : 'lower';
    else if (equivalenceSignificant) verdict = 'equivalent';
    out[row.spec.id] = {
      id: row.spec.id,
      n: row.d.length,
      meanDifference: row.m,
      pDifference: row.pDiff,
      pDifferenceAdjusted: diffAdjusted[i] ?? 1,
      pEquivalence: row.pEq,
      pEquivalenceAdjusted: eqAdjusted[i] ?? 1,
      differenceSignificant,
      equivalenceSignificant,
      verdict,
    };
  });
  return out;
}

export type Conclusion =
  /** baseline 대비 높음, placebo 대비 높음. */
  | 'content-effect'
  /** baseline 대비 높음, placebo 대비 동등 또는 판정 불가. */
  | 'effect-unattributed'
  /** baseline 대비 동등. */
  | 'no-meaningful-change'
  /** baseline 대비 낮음. */
  | 'lowered'
  /** baseline 대비 판정 불가. */
  | 'undetermined'
  /** baseline 대비 높음, placebo 대비 낮음. */
  | 'placebo-stronger';

/** 설계 2.1의 대응표. baseline 쪽 판정이 먼저 결론을 정한다. */
export function conclude(versusBaseline: Verdict, versusPlacebo: Verdict): Conclusion {
  switch (versusBaseline) {
    case 'equivalent':
      return 'no-meaningful-change';
    case 'lower':
      return 'lowered';
    case 'inconclusive':
      return 'undetermined';
    case 'higher':
      if (versusPlacebo === 'higher') return 'content-effect';
      if (versusPlacebo === 'lower') return 'placebo-stronger';
      return 'effect-unattributed';
  }
}

const PURPOSE_LABEL: Readonly<Record<Purpose, string>> = {
  p1: '목적 1(전환 정확성)',
  p2: '목적 2(차이 판단의 정확성)',
};
const CONTROL_LABEL: Readonly<Record<ControlArm, string>> = {
  baseline: 'baseline 실행(Skill 없음)',
  placebo: 'placebo 실행',
};

const pointText = (delta: number): string => `${Math.round(delta * 100)}pp`;

/** 가설 하나의 판정 문장. 주어(평가 시스템)와 비교 대상을 모두 쓴다. */
export function verdictSentence(spec: HypothesisSpec, verdict: Verdict, delta: number): string {
  const subject = `평가 시스템은 공식 Skill 실행의 ${PURPOSE_LABEL[spec.purpose]} 점수가`;
  const control = CONTROL_LABEL[spec.control];
  switch (verdict) {
    case 'higher':
      return `${subject} ${control}보다 높다고 판정한다.`;
    case 'lower':
      return `${subject} ${control}보다 낮다고 판정한다.`;
    case 'equivalent':
      return `${subject} ${control}과 ±${pointText(delta)} 안에서 같다고 판정한다.`;
    case 'inconclusive':
      return `${subject} ${control}보다 높은지, 낮은지, ±${pointText(delta)} 안에서 같은지 판정하지 못했다.`;
  }
}

/** 목적 하나의 결론 문장 (설계 2.1 표의 결론 열). */
export function conclusionSentence(
  purpose: Purpose,
  conclusion: Conclusion,
  delta: number,
): string {
  const target = `${PURPOSE_LABEL[purpose]} 달성률`;
  switch (conclusion) {
    case 'content-effect':
      return `공식 Skill의 내용이 ${target}을 높였다.`;
    case 'effect-unattributed':
      return `공식 Skill이 ${target}을 높였지만, 내용 때문인지 지시문을 넣는 행위 때문인지 가를 수 없다.`;
    case 'no-meaningful-change':
      return `공식 Skill은 ${target}을 ${pointText(delta)} 넘게 바꾸지 않는다.`;
    case 'lowered':
      return `공식 Skill이 ${target}을 낮췄다.`;
    case 'undetermined':
      return `이 규모로는 ${PURPOSE_LABEL[purpose]}을 판정할 수 없다. 95% 구간을 보고한다.`;
    case 'placebo-stronger':
      return `공식 Skill이 ${target}을 높였지만 placebo가 더 높였다. 공식 Skill 내용의 효과라는 근거는 없다.`;
  }
}
