/**
 * 프로젝트·모델별 가설 판정과 결론 대응표.
 *
 * 가설은 (프로젝트, 모델)마다 두 개다.
 * - H_a: skill 실행 점수 평균 vs baseline 실행 점수 평균
 * - H_b: skill 실행 점수 평균 vs placebo 실행 점수 평균
 * 프로젝트 2개 × 모델 2개 × 2 = 8개 가설을 한 묶음으로 본다.
 *
 * 가설마다 아래를 계산한다.
 * 1. 차이 검정: 두 표본 순열 검정의 양측 p값 (permutation.ts).
 * 2. 동등 검정: 처리 표본을 ±δ 옮긴 두 단측 순열 검정(TOST)의 p값.
 * 3. Holm 보정을 차이 p값 8개와 동등 p값 8개에 따로 적용한다(전체 α).
 * 4. 판정: 차이가 유의하면 평균 차이의 부호로 높음·낮음, 아니면 동등이 유의할 때 동등,
 *    둘 다 아니면 판정 불가. 차이가 유의하면 동등보다 먼저 쓴다.
 */
import { permutationTests, type PermutationOptions } from './permutation.js';

/** 사전 등록한 설계의 프로젝트와 모델. 사전 등록 파일에 목록이 없으면 이 값을 쓴다. */
export const DESIGN_PROJECTS = ['recharts', 'swagger-typescript-api'] as const;
export const DESIGN_MODELS = ['claude-sonnet-5-5', 'claude-haiku-5-5'] as const;

export type ControlArm = 'baseline' | 'placebo';
export type Verdict = 'higher' | 'lower' | 'equivalent' | 'inconclusive';

export interface HypothesisSpec {
  readonly project: string;
  readonly model: string;
  readonly control: ControlArm;
}

/** 가설 묶음. 프로젝트 → 모델 → baseline, placebo 순서다. */
export function hypothesisFamily(
  projects: readonly string[],
  models: readonly string[],
): HypothesisSpec[] {
  return projects.flatMap((project) =>
    models.flatMap((model) =>
      (['baseline', 'placebo'] as const).map((control) => ({ project, model, control })),
    ),
  );
}

export const hypothesisKey = (spec: HypothesisSpec): string =>
  `${spec.project}/${spec.model}/${spec.control}`;

export interface PValueRow {
  /** 실행이 없는 쪽이 있으면 null. */
  readonly meanDifference: number | null;
  readonly pDifference: number;
  readonly pEquivalence: number;
}

export interface HypothesisDecision extends PValueRow {
  /** Holm 조정 p값 (차이 검정 묶음 안에서). */
  readonly pDifferenceAdjusted: number;
  /** Holm 조정 p값 (동등 검정 묶음 안에서). */
  readonly pEquivalenceAdjusted: number;
  readonly differenceSignificant: boolean;
  readonly equivalenceSignificant: boolean;
  readonly verdict: Verdict;
}

/** Holm 조정 p값. 정렬 순서대로 (m − rank)·p의 누적 최댓값이고 1을 넘지 않는다. */
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
 * p값 묶음에 Holm 보정을 적용해 판정한다. 조정 p <= α이면 기각이다(Holm 단계 절차와 같다).
 * 시뮬레이션도 이 함수를 써서 보고서와 같은 판정 규칙을 따른다.
 */
export function decideFromPValues(rows: readonly PValueRow[], alpha: number): HypothesisDecision[] {
  const diffAdjusted = holmAdjusted(rows.map((r) => r.pDifference));
  const eqAdjusted = holmAdjusted(rows.map((r) => r.pEquivalence));
  return rows.map((row, i) => {
    const pDifferenceAdjusted = diffAdjusted[i] ?? 1;
    const pEquivalenceAdjusted = eqAdjusted[i] ?? 1;
    const m = row.meanDifference;
    const direction = m === null || m === 0 ? null : m > 0 ? 'higher' : 'lower';
    const differenceSignificant = pDifferenceAdjusted <= alpha && direction !== null;
    const equivalenceSignificant = pEquivalenceAdjusted <= alpha;
    let verdict: Verdict = 'inconclusive';
    if (differenceSignificant) verdict = direction;
    else if (equivalenceSignificant) verdict = 'equivalent';
    return {
      ...row,
      pDifferenceAdjusted,
      pEquivalenceAdjusted,
      differenceSignificant,
      equivalenceSignificant,
      verdict,
    };
  });
}

export interface HypothesisSample {
  readonly spec: HypothesisSpec;
  /** skill 실행 점수. */
  readonly treatment: readonly number[];
  /** 대조(baseline 또는 placebo) 실행 점수. */
  readonly control: readonly number[];
}

export interface DecisionOptions extends PermutationOptions {
  readonly alpha: number;
  readonly delta: number;
}

export interface HypothesisResult extends HypothesisDecision {
  readonly spec: HypothesisSpec;
  readonly method: 'exact' | 'monte-carlo' | null;
}

/** 가설 묶음 전체를 판정한다. 한쪽 실행이 없는 가설은 p = 1로 넣어 판정 불가가 된다. */
export function decideHypotheses(
  samples: readonly HypothesisSample[],
  options: DecisionOptions,
): HypothesisResult[] {
  const tests = samples.map((s) =>
    s.treatment.length === 0 || s.control.length === 0
      ? null
      : permutationTests(s.treatment, s.control, options.delta, options),
  );
  const rows: PValueRow[] = tests.map((t) =>
    t === null
      ? { meanDifference: null, pDifference: 1, pEquivalence: 1 }
      : {
          meanDifference: t.meanDifference,
          pDifference: t.pDifference,
          pEquivalence: t.pEquivalence,
        },
  );
  return decideFromPValues(rows, options.alpha).map((decision, i) => ({
    ...decision,
    spec: samples[i]?.spec as HypothesisSpec,
    method: tests[i]?.method ?? null,
  }));
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

/** 결론 대응표. baseline 쪽 판정이 먼저 결론을 정한다. */
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

/** 'claude-sonnet-5-5' → 'Sonnet 5.5'. 형식이 다르면 ID를 그대로 쓴다. */
export function modelLabel(model: string): string {
  const match = /^claude-([a-z]+)-(\d+)-(\d+)/.exec(model);
  if (match === null) return model;
  const [, family = '', major = '', minor = ''] = match;
  return `${family.charAt(0).toUpperCase()}${family.slice(1)} ${major}.${minor}`;
}

const CONTROL_LABEL: Readonly<Record<ControlArm, string>> = {
  baseline: 'baseline 실행',
  placebo: 'placebo 실행',
};

const pointText = (delta: number): string => `${Math.round(delta * 100)}pp`;

/** 가설 하나의 판정 문장. 주어(평가 시스템), 프로젝트, 모델, 비교 대상을 모두 쓴다. */
export function verdictSentence(spec: HypothesisSpec, verdict: Verdict, delta: number): string {
  const subject = `평가 시스템은 ${spec.project} 전환에서 ${modelLabel(spec.model)}의 공식 Skill 실행 점수가`;
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

/** (프로젝트, 모델) 하나의 결론 문장 (대응표의 결론 열). */
export function conclusionSentence(
  project: string,
  model: string,
  conclusion: Conclusion,
  delta: number,
): string {
  const where = `${project} 전환에서`;
  const target = `${modelLabel(model)}의 실행 점수`;
  switch (conclusion) {
    case 'content-effect':
      return `${where} 공식 Skill의 내용이 ${target}를 높였다.`;
    case 'effect-unattributed':
      return `${where} 공식 Skill이 ${target}를 높였지만, 내용 때문인지 지시문을 넣는 행위 때문인지 가를 수 없다.`;
    case 'no-meaningful-change':
      return `${where} 공식 Skill은 ${target}를 ${pointText(delta)} 넘게 바꾸지 않는다.`;
    case 'lowered':
      return `${where} 공식 Skill이 ${target}를 낮췄다.`;
    case 'undetermined':
      return `이 실행 횟수로는 평가 시스템이 ${where} 공식 Skill이 ${target}에 준 효과를 판정할 수 없다. 95% 구간을 보고한다.`;
    case 'placebo-stronger':
      return `${where} 공식 Skill이 ${target}를 높였지만 placebo가 더 높였다. 공식 Skill 내용의 효과라는 근거는 없다.`;
  }
}
