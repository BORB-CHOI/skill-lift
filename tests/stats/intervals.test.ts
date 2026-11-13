import { describe, expect, it } from 'vitest';
import { wilsonInterval } from '../../src/stats/intervals.js';

describe('wilsonInterval', () => {
  it('10회 중 8회 성공의 95% 구간은 알려진 값과 같다', () => {
    const { lower, upper } = wilsonInterval(8, 10);
    expect(lower).toBeCloseTo(0.4902, 4);
    expect(upper).toBeCloseTo(0.9433, 4);
  });

  it('전부 성공해도 구간 폭이 0이 되지 않는다', () => {
    const { lower, upper } = wilsonInterval(10, 10);
    expect(upper).toBe(1);
    expect(lower).toBeCloseTo(0.7225, 4);
  });

  it('전부 실패하면 하한은 0이다', () => {
    const { lower, upper } = wilsonInterval(0, 10);
    expect(lower).toBe(0);
    expect(upper).toBeCloseTo(0.2775, 4);
  });

  it('잘못된 입력은 거부한다', () => {
    expect(() => wilsonInterval(11, 10)).toThrow(RangeError);
    expect(() => wilsonInterval(1, 0)).toThrow(RangeError);
    expect(() => wilsonInterval(1.5, 10)).toThrow(RangeError);
  });
});
