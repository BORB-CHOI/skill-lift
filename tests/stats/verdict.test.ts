import { describe, expect, it } from 'vitest';
import { bcaInterval, normalCdf, normalQuantile } from '../../src/stats/bootstrap.js';
import { decide, hasHeadroom, type VerdictOptions } from '../../src/stats/verdict.js';

const repeat = (value: number, n: number): number[] => Array.from({ length: n }, () => value);

const options: VerdictOptions = {
  alpha: 0.05,
  hypotheses: 6,
  significant: false,
  delta: 0.1,
  minDiscriminating: 8,
  equivalenceEnabled: true,
};

describe('정규분포 근사', () => {
  it('알려진 값과 같다', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.959964)).toBeCloseTo(0.975, 6);
    expect(normalQuantile(0.975)).toBeCloseTo(1.959964, 5);
    expect(normalQuantile(0.01)).toBeCloseTo(-2.326348, 5);
  });

  it('분위수와 누적분포는 서로 역함수다', () => {
    for (const p of [0.001, 0.05, 0.3, 0.5, 0.8, 0.999]) {
      expect(normalCdf(normalQuantile(p))).toBeCloseTo(p, 6);
    }
  });
});

describe('bcaInterval', () => {
  it('차이가 전부 같으면 폭이 0이다', () => {
    expect(bcaInterval(repeat(0.25, 10), 0.95)).toEqual({ lower: 0.25, upper: 0.25 });
  });

  it('같은 시드는 같은 구간을 낸다', () => {
    const d = [0.33, 0, -0.33, 0.67, 0, 0.33, 0, 0, 0.33, -0.33];
    expect(bcaInterval(d, 0.95, 42)).toEqual(bcaInterval(d, 0.95, 42));
  });

  it('구간은 관측 평균을 포함하고 신뢰수준이 높으면 넓어진다', () => {
    const d = [0.33, 0, -0.33, 0.67, 0, 0.33, 0, 0, 0.33, -0.33];
    const narrow = bcaInterval(d, 0.9, 3);
    const wide = bcaInterval(d, 0.99, 3);
    expect(narrow.lower).toBeLessThanOrEqual(0.1);
    expect(narrow.upper).toBeGreaterThanOrEqual(0.1);
    expect(wide.lower).toBeLessThanOrEqual(narrow.lower);
    expect(wide.upper).toBeGreaterThanOrEqual(narrow.upper);
  });
});

describe('hasHeadroom', () => {
  it('대조 arm이 전부 통과하면 여지가 없다', () => {
    expect(hasHeadroom(repeat(1, 16), 0.1, 8).ok).toBe(false);
  });

  it('평균이 범위 안이고 0도 1도 아닌 과제가 충분하면 여지가 있다', () => {
    expect(hasHeadroom(repeat(2 / 3, 16), 0.1, 8)).toMatchObject({ discriminating: 16, ok: true });
  });

  it('평균은 범위 안이어도 과제마다 0 아니면 1이면 여지가 없다', () => {
    const scores = [...repeat(1, 8), ...repeat(0, 8)];
    expect(hasHeadroom(scores, 0.1, 8)).toMatchObject({ controlMean: 0.5, ok: false });
  });
});

describe('decide', () => {
  it('차이 검정이 유의하고 평균이 양이면 개선이다', () => {
    const r = decide(repeat(0.5, 10), repeat(0.5, 10), { ...options, significant: true });
    expect(r.verdict).toBe('improved');
    expect(r.pValue).toBeCloseTo(2 / 1024, 12);
  });

  it('차이 검정이 유의하고 평균이 음이면 악화다', () => {
    const r = decide(repeat(-0.5, 10), repeat(0.5, 10), { ...options, significant: true });
    expect(r.verdict).toBe('worsened');
  });

  it('차이가 0이어도 대조 arm이 천장이면 동등이 아니라 판정 불가다', () => {
    const r = decide(repeat(0, 16), repeat(1, 16), options);
    expect(r).toMatchObject({ verdict: 'inconclusive', reason: 'no-headroom' });
  });

  it('여지가 있는데 차이가 0이고 과제가 충분하면 동등이다', () => {
    const r = decide(repeat(0, 16), repeat(2 / 3, 16), options);
    expect(r).toMatchObject({ verdict: 'equivalent', reason: null, nonzeroDifferences: 0 });
  });

  it('과제가 적으면 차이가 0이어도 동등 검정이 유의하지 않다', () => {
    // 과제 6개의 단측 최소 p값은 1/64로 0.05/6보다 크다.
    const r = decide(repeat(0, 6), repeat(0.5, 6), { ...options, minDiscriminating: 6 });
    expect(r).toMatchObject({ verdict: 'inconclusive', reason: 'not-equivalent' });
  });

  it('차이가 δ보다 크면 동등이 아니다', () => {
    const r = decide(repeat(0.33, 16), repeat(0.5, 16), options);
    expect(r).toMatchObject({ verdict: 'inconclusive', reason: 'not-equivalent' });
  });

  it('동등 판정을 쓰지 않기로 한 추정 대상은 동등을 내지 않는다', () => {
    const r = decide(repeat(0, 16), repeat(2 / 3, 16), { ...options, equivalenceEnabled: false });
    expect(r).toMatchObject({ verdict: 'inconclusive', reason: 'equivalence-disabled' });
  });

  it('과제 수가 다르면 거부한다', () => {
    expect(() => decide([0, 0], [0.5], options)).toThrow(RangeError);
  });
});
