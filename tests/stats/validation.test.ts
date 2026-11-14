import { describe, expect, it } from 'vitest';
import { powerCurve, splitHalf } from '../../src/stats/validation.js';

/** 과제 16개, 실행 6회. 과제마다 통과율이 다르다. */
function runs(seed: number): number[][] {
  let s = seed;
  const next = (): number => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  return Array.from({ length: 16 }, (_unused, i) => {
    const rate = 0.2 + (0.6 * i) / 15;
    return Array.from({ length: 6 }, () => (next() < rate ? 1 : 0));
  });
}

describe('splitHalf', () => {
  it('차이 없는 데이터에서 개선·악화 판정이 드물다', () => {
    const r = splitHalf(runs(3), 200, 0.05, 1, 7);
    expect(r.iterations).toBe(200);
    expect(r.falseVerdictRate).toBeLessThan(0.1);
  });

  it('모든 실행이 같은 점수면 판정이 나오지 않는다', () => {
    const allPass = Array.from({ length: 16 }, () => Array.from({ length: 6 }, () => 1));
    expect(splitHalf(allPass, 50, 0.05, 1).falseVerdictRate).toBe(0);
  });

  it('같은 시드는 같은 결과를 낸다', () => {
    expect(splitHalf(runs(5), 100, 0.05, 1, 11)).toEqual(splitHalf(runs(5), 100, 0.05, 1, 11));
  });
});

describe('powerCurve', () => {
  it('주입한 효과가 클수록 검출률이 오른다', () => {
    const curve = powerCurve(runs(3), 3, [0, 0.4, 1], 'improve', 100, 0.05, 1, 5);
    const [none, mid, full] = curve.map((p) => p.detectionRate);
    expect(none).toBeLessThan(0.1);
    expect(mid ?? 0).toBeGreaterThan(none ?? 0);
    expect(full).toBeGreaterThan(0.9);
  });

  it('악화 방향도 검출한다', () => {
    const [full] = powerCurve(runs(3), 3, [1], 'worsen', 50, 0.05, 1, 5);
    expect(full?.detectionRate).toBeGreaterThan(0.9);
  });
});
