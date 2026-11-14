import { describe, expect, it } from 'vitest';
import {
  conclude,
  conclusionSentence,
  decideHypotheses,
  holmAdjusted,
  HYPOTHESES,
  verdictSentence,
  type HypothesisId,
  type Verdict,
} from '../../src/stats/decision.js';

const OPTIONS = { alpha: 0.05, delta: 0.15 };
const repeat = (value: number, n: number): number[] => Array.from({ length: n }, () => value);

function input(
  partial: Partial<Record<HypothesisId, number[]>>,
): Record<HypothesisId, readonly number[]> {
  return { H1: [], H2: [], H3: [], H4: [], ...partial };
}

describe('holmAdjusted', () => {
  it('손으로 계산한 Holm 조정 p값과 같다', () => {
    // 정렬: 0.01(×4=0.04), 0.02(×3=0.06), 0.03(×2=0.06), 0.5(×1=0.5)
    const adjusted = holmAdjusted([0.03, 0.01, 0.5, 0.02]);
    [0.06, 0.04, 0.5, 0.06].forEach((expected, i) => {
      expect(adjusted[i]).toBeCloseTo(expected, 12);
    });
  });
});

describe('decideHypotheses', () => {
  it('10개 과제가 모두 크게 오르면 높음이다', () => {
    const r = decideHypotheses(input({ H1: repeat(0.4, 10) }), OPTIONS);
    expect(r.H1.verdict).toBe('higher');
    expect(r.H1.pDifference).toBeCloseTo(2 / 1024, 12);
  });

  it('모두 크게 내리면 낮음이다', () => {
    const r = decideHypotheses(input({ H2: repeat(-0.4, 10) }), OPTIONS);
    expect(r.H2.verdict).toBe('lower');
  });

  it('차이가 0 근처에 몰리면 동등이다', () => {
    const d = [0, 0.05, -0.05, 0, 0.02, -0.02, 0, 0.03, -0.03, 0];
    const r = decideHypotheses(input({ H3: d }), OPTIONS);
    expect(r.H3.verdict).toBe('equivalent');
    expect(r.H3.differenceSignificant).toBe(false);
  });

  it('과제가 적으면 판정 불가다', () => {
    const r = decideHypotheses(input({ H4: [0.4, 0.4, 0.4, 0.4, 0.4] }), OPTIONS);
    expect(r.H4.verdict).toBe('inconclusive');
  });

  it('과제가 없는 가설은 p = 1로 판정 불가다', () => {
    const r = decideHypotheses(input({}), OPTIONS);
    for (const spec of HYPOTHESES) {
      expect(r[spec.id].verdict).toBe('inconclusive');
      expect(r[spec.id].pDifference).toBe(1);
    }
  });

  it('차이가 유의하면 동등보다 먼저 쓴다', () => {
    // 평균 +0.05로 ±0.15 안이지만 모두 양수라 차이도 유의하다.
    const r = decideHypotheses(input({ H1: repeat(0.05, 12) }), OPTIONS);
    expect(r.H1.equivalenceSignificant).toBe(true);
    expect(r.H1.differenceSignificant).toBe(true);
    expect(r.H1.verdict).toBe('higher');
  });

  it('Holm 보정은 차이 p값 4개 안에서 적용된다', () => {
    // 8개 과제 전부 양수: p = 2/256 ≈ 0.0078. 혼자면 α/4 = 0.0125보다 작아 유의하다.
    const alone = decideHypotheses(input({ H1: repeat(0.3, 8) }), OPTIONS);
    expect(alone.H1.verdict).toBe('higher');
    // 7개 과제: p = 2/128 ≈ 0.0156 > 0.0125. 네 가설 중 가장 작아도 기각되지 않는다.
    const seven = decideHypotheses(input({ H1: repeat(0.3, 7) }), OPTIONS);
    expect(seven.H1.verdict).toBe('inconclusive');
    expect(seven.H1.pDifferenceAdjusted).toBeCloseTo(4 * (2 / 128), 12);
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
  it('판정 문장은 주어와 비교 대상을 쓴다', () => {
    const h1 = HYPOTHESES[0];
    if (h1 === undefined) throw new Error('가설 표가 비었다');
    expect(verdictSentence(h1, 'higher', 0.15)).toBe(
      '평가 시스템은 공식 Skill 실행의 목적 1(전환 정확성) 점수가 baseline 실행(Skill 없음)보다 높다고 판정한다.',
    );
    expect(verdictSentence(h1, 'equivalent', 0.15)).toContain('±15pp 안에서 같다고 판정한다');
  });

  it('결론 문장은 2.1 표의 문구를 따른다', () => {
    expect(conclusionSentence('p2', 'no-meaningful-change', 0.15)).toBe(
      '공식 Skill은 목적 2(차이 판단의 정확성) 달성률을 15pp 넘게 바꾸지 않는다.',
    );
    expect(conclusionSentence('p1', 'content-effect', 0.15)).toBe(
      '공식 Skill의 내용이 목적 1(전환 정확성) 달성률을 높였다.',
    );
  });
});
