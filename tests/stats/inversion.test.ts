import { describe, expect, it } from 'vitest';
import { signFlipInterval } from '../../src/stats/inversion.js';
import { equivalencePValue, mulberry32, signFlipPValue } from '../../src/stats/paired.js';
import { fastEquivalencePValue, fastSignFlipPValue } from '../../src/stats/signflip.js';

function randomDifferences(n: number, seed: number): number[] {
  const random = mulberry32(seed);
  // 실제 데이터처럼 1/6 단위의 차이를 만든다.
  return Array.from({ length: n }, () => Math.round((random() * 2 - 1) * 6) / 6);
}

describe('fastSignFlipPValue', () => {
  it('정확 열거 범위에서 signFlipPValue와 같은 값을 낸다', () => {
    for (let n = 1; n <= 14; n++) {
      for (let seed = 1; seed <= 5; seed++) {
        const d = randomDifferences(n, seed * 100 + n);
        for (const tail of ['two-sided', 'greater', 'less'] as const) {
          expect(fastSignFlipPValue(d, tail)).toBeCloseTo(signFlipPValue(d, tail), 12);
        }
      }
    }
  });

  it('n = 20에서도 전수 열거와 같다', () => {
    const d = randomDifferences(20, 7);
    expect(fastSignFlipPValue(d)).toBeCloseTo(signFlipPValue(d), 12);
  });

  it('n > 20이면 같은 시드의 signFlipPValue와 같은 몬테카를로 값을 낸다', () => {
    const d = randomDifferences(22, 3);
    expect(fastSignFlipPValue(d, 'two-sided', { seed: 5 })).toBe(signFlipPValue(d, 'two-sided', 5));
  });

  it('동등 p값은 equivalencePValue와 같다', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const d = randomDifferences(10, seed).map((x) => x / 4);
      expect(fastEquivalencePValue(d, 0.15)).toBeCloseTo(equivalencePValue(d, 0.15), 12);
    }
  });
});

describe('signFlipInterval', () => {
  it('구간은 평균을 포함한다', () => {
    const d = [0.1, 0.3, 0.2, 0.5, -0.1, 0.4, 0.2, 0.3];
    const { lower, upper } = signFlipInterval(d);
    const m = d.reduce((s, x) => s + x, 0) / d.length;
    expect(lower).toBeLessThan(m);
    expect(upper).toBeGreaterThan(m);
  });

  it('경계 바로 안쪽은 받아들이고 바로 바깥쪽은 기각한다', () => {
    const d = randomDifferences(12, 11);
    const alpha = 0.05;
    const { lower, upper } = signFlipInterval(d, alpha, { tolerance: 1e-9 });
    const p = (theta: number): number => fastSignFlipPValue(d.map((x) => x - theta));
    expect(p(lower + 1e-6)).toBeGreaterThan(alpha);
    expect(p(lower - 1e-6)).toBeLessThanOrEqual(alpha);
    expect(p(upper - 1e-6)).toBeGreaterThan(alpha);
    expect(p(upper + 1e-6)).toBeLessThanOrEqual(alpha);
  });

  it('구간에서 0이 빠지면 양측 검정도 유의하다 (검정과 구간이 일치한다)', () => {
    const d = [0.3, 0.5, 0.2, 0.4, 0.6, 0.3, 0.1, 0.5];
    const { lower } = signFlipInterval(d);
    expect(lower).toBeGreaterThan(0);
    expect(fastSignFlipPValue(d)).toBeLessThanOrEqual(0.05);
  });

  it('차이가 전부 같으면 구간은 그 값으로 좁아진다', () => {
    const d = Array.from({ length: 8 }, () => 0.25);
    const { lower, upper } = signFlipInterval(d);
    expect(lower).toBeCloseTo(0.25, 5);
    expect(upper).toBeCloseTo(0.25, 5);
  });

  it('과제가 5개 이하면 경계가 없어 ±Infinity를 낸다', () => {
    const { lower, upper } = signFlipInterval([0.1, 0.2, 0.3, 0.4, 0.5]);
    expect(lower).toBe(-Infinity);
    expect(upper).toBe(Infinity);
  });

  it('n > 20이면 몬테카를로로 계산하고 같은 시드는 같은 구간을 낸다', () => {
    const d = randomDifferences(24, 9);
    const a = signFlipInterval(d, 0.05, { seed: 3, samples: 5_000, tolerance: 1e-4 });
    const b = signFlipInterval(d, 0.05, { seed: 3, samples: 5_000, tolerance: 1e-4 });
    expect(a).toEqual(b);
    expect(Number.isFinite(a.lower) && Number.isFinite(a.upper)).toBe(true);
  });

  it('빈 배열과 범위 밖 α를 거부한다', () => {
    expect(() => signFlipInterval([])).toThrow(RangeError);
    expect(() => signFlipInterval([0.1], 0)).toThrow(RangeError);
  });
});
