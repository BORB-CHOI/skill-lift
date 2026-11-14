import { describe, expect, it } from 'vitest';
import {
  conclude,
  conclusionSentence,
  decideFromPValues,
  decideHypotheses,
  holmAdjusted,
  hypothesisFamily,
  modelLabel,
  verdictSentence,
  type HypothesisSample,
  type Verdict,
} from '../../src/stats/decision.js';

const OPTIONS = { alpha: 0.05, delta: 0.15 };
const repeat = (value: number, n: number): number[] => Array.from({ length: n }, () => value);
const FAMILY = hypothesisFamily(
  ['recharts', 'swagger-typescript-api'],
  ['claude-sonnet-5-5', 'claude-haiku-5-5'],
);

/** 가설 8개 가운데 index번에만 표본을 넣고 나머지는 비운다(p = 1). */
function only(index: number, treatment: number[], control: number[]): HypothesisSample[] {
  return FAMILY.map((spec, i) =>
    i === index ? { spec, treatment, control } : { spec, treatment: [], control: [] },
  );
}

describe('hypothesisFamily', () => {
  it('프로젝트 2 × 모델 2 × 대조 2 = 8개를 프로젝트 → 모델 → 대조 순서로 만든다', () => {
    expect(FAMILY).toHaveLength(8);
    expect(FAMILY[0]).toEqual({
      project: 'recharts',
      model: 'claude-sonnet-5-5',
      control: 'baseline',
    });
    expect(FAMILY[1]?.control).toBe('placebo');
    expect(FAMILY[2]?.model).toBe('claude-haiku-5-5');
    expect(FAMILY[7]?.project).toBe('swagger-typescript-api');
  });
});

describe('holmAdjusted', () => {
  it('손으로 계산한 Holm 조정 p값과 같다', () => {
    // 정렬: 0.01(×4=0.04), 0.02(×3=0.06), 0.03(×2=0.06), 0.5(×1=0.5)
    const adjusted = holmAdjusted([0.03, 0.01, 0.5, 0.02]);
    [0.06, 0.04, 0.5, 0.06].forEach((expected, i) => {
      expect(adjusted[i]).toBeCloseTo(expected, 12);
    });
  });
});

describe('decideFromPValues', () => {
  it('Holm은 8개 묶음 안에서 적용된다', () => {
    const rows = Array.from({ length: 8 }, () => ({
      meanDifference: 0,
      pDifference: 1,
      pEquivalence: 1,
    }));
    // α/8 = 0.00625. 0.006은 기각, 0.007은 기각되지 않는다.
    const pass = decideFromPValues(
      [{ ...rows[0], meanDifference: 0.2, pDifference: 0.006, pEquivalence: 1 }, ...rows.slice(1)],
      0.05,
    );
    expect(pass[0]?.verdict).toBe('higher');
    const fail = decideFromPValues(
      [{ meanDifference: 0.2, pDifference: 0.007, pEquivalence: 1 }, ...rows.slice(1)],
      0.05,
    );
    expect(fail[0]?.verdict).toBe('inconclusive');
    expect(fail[0]?.pDifferenceAdjusted).toBeCloseTo(0.056, 12);
  });

  it('차이가 유의하면 동등보다 먼저 쓴다', () => {
    const r = decideFromPValues(
      [{ meanDifference: -0.05, pDifference: 0.001, pEquivalence: 0.001 }],
      0.05,
    );
    expect(r[0]?.equivalenceSignificant).toBe(true);
    expect(r[0]?.verdict).toBe('lower');
  });
});

describe('decideHypotheses', () => {
  it('skill이 10회 모두 1점, baseline이 10회 모두 0점이면 높음이다', () => {
    const [r] = decideHypotheses(only(0, repeat(1, 10), repeat(0, 10)), OPTIONS);
    expect(r?.verdict).toBe('higher');
    expect(r?.method).toBe('exact');
    // C(20, 10) = 184,756배치 중 양 끝 두 배치만 극단이다. Holm은 8을 곱한다.
    expect(r?.pDifference).toBeCloseTo(2 / 184_756, 15);
    expect(r?.pDifferenceAdjusted).toBeCloseTo((8 * 2) / 184_756, 15);
  });

  it('반대 방향이면 낮음이다', () => {
    const r = decideHypotheses(only(3, repeat(0, 10), repeat(1, 10)), OPTIONS);
    expect(r[3]?.verdict).toBe('lower');
  });

  it('두 조건 점수가 0.05 안에서 섞여 있으면 동등이다', () => {
    const skill = [0.5, 0.55, 0.5, 0.45, 0.5, 0.55, 0.5, 0.45, 0.5, 0.5];
    const base = [0.5, 0.45, 0.55, 0.5, 0.5, 0.45, 0.55, 0.5, 0.5, 0.5];
    const r = decideHypotheses(only(1, skill, base), OPTIONS);
    expect(r[1]?.differenceSignificant).toBe(false);
    expect(r[1]?.verdict).toBe('equivalent');
  });

  it('실행이 적으면 판정 불가다', () => {
    const r = decideHypotheses(only(0, [1, 1, 1], [0, 0, 0]), OPTIONS);
    expect(r[0]?.pDifference).toBeCloseTo(0.1, 12);
    expect(r[0]?.verdict).toBe('inconclusive');
  });

  it('실행이 없는 가설은 p = 1로 판정 불가다', () => {
    for (const r of decideHypotheses(only(-1, [], []), OPTIONS)) {
      expect(r.verdict).toBe('inconclusive');
      expect(r.pDifference).toBe(1);
      expect(r.meanDifference).toBeNull();
      expect(r.method).toBeNull();
    }
  });
});

describe('conclude', () => {
  const all: Verdict[] = ['higher', 'lower', 'equivalent', 'inconclusive'];
  const cases: [Verdict, Verdict, string][] = [
    ['higher', 'higher', 'content-effect'],
    ['higher', 'equivalent', 'effect-unattributed'],
    ['higher', 'inconclusive', 'effect-unattributed'],
    ['higher', 'lower', 'placebo-stronger'],
  ];
  it.each(cases)('baseline %s, placebo %s → %s', (b, p, expected) => {
    expect(conclude(b, p)).toBe(expected);
  });

  it('baseline 대비 동등·낮음·판정 불가는 placebo 판정과 무관하다', () => {
    for (const p of all) {
      expect(conclude('equivalent', p)).toBe('no-meaningful-change');
      expect(conclude('lower', p)).toBe('lowered');
      expect(conclude('inconclusive', p)).toBe('undetermined');
    }
  });
});

describe('문장', () => {
  it('모델 ID를 사람이 읽는 이름으로 바꾼다', () => {
    expect(modelLabel('claude-sonnet-5-5')).toBe('Sonnet 5.5');
    expect(modelLabel('claude-haiku-5-5')).toBe('Haiku 5.5');
    expect(modelLabel('other-model')).toBe('other-model');
  });

  it('판정 문장은 주어, 프로젝트, 모델, 비교 대상을 쓴다', () => {
    const spec = FAMILY[0];
    if (spec === undefined) throw new Error('가설 묶음이 비었다');
    expect(verdictSentence(spec, 'higher', 0.15)).toBe(
      '평가 시스템은 recharts 전환에서 Sonnet 5.5의 공식 Skill 실행 점수가 baseline 실행보다 높다고 판정한다.',
    );
    expect(verdictSentence({ ...spec, control: 'placebo' }, 'equivalent', 0.15)).toBe(
      '평가 시스템은 recharts 전환에서 Sonnet 5.5의 공식 Skill 실행 점수가 placebo 실행과 ±15pp 안에서 같다고 판정한다.',
    );
  });

  it('결론 문장은 대응표의 문구에 프로젝트와 모델을 넣는다', () => {
    expect(
      conclusionSentence(
        'swagger-typescript-api',
        'claude-haiku-5-5',
        'no-meaningful-change',
        0.15,
      ),
    ).toBe(
      'swagger-typescript-api 전환에서 공식 Skill은 Haiku 5.5의 실행 점수를 15pp 넘게 바꾸지 않는다.',
    );
    expect(conclusionSentence('recharts', 'claude-sonnet-5-5', 'content-effect', 0.15)).toBe(
      'recharts 전환에서 공식 Skill의 내용이 Sonnet 5.5의 실행 점수를 높였다.',
    );
  });
});
