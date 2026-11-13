import { describe, expect, it } from 'vitest';
import {
  equivalencePValue,
  holm,
  minNonzeroForAlpha,
  signFlipPValue,
  taskDifferences,
} from '../../src/stats/paired.js';

describe('taskDifferences', () => {
  it('과제별 통과 비율의 차이를 낸다', () => {
    const treatment = [
      [1, 1, 1],
      [1, 0, 0],
    ];
    const control = [
      [1, 0, 0],
      [1, 0, 0],
    ];
    const d = taskDifferences(treatment, control);
    expect(d[0]).toBeCloseTo(2 / 3, 12);
    expect(d[1]).toBeCloseTo(0, 12);
  });

  it('과제 수가 다르면 거부한다', () => {
    expect(() => taskDifferences([[1]], [[1], [0]])).toThrow(RangeError);
  });
});

describe('signFlipPValue', () => {
  it('여섯 과제가 모두 같은 방향이면 양측 p값은 2/64다', () => {
    expect(signFlipPValue([1, 1, 1, 1, 1, 1])).toBeCloseTo(2 / 64, 12);
  });

  it('다섯 과제로는 전부 이겨도 0.05 아래로 내려가지 못한다', () => {
    expect(signFlipPValue([1, 1, 1, 1, 1])).toBeCloseTo(2 / 32, 12);
  });

  it('차이가 상쇄되면 p값은 1이다', () => {
    expect(signFlipPValue([0.5, -0.5])).toBe(1);
  });

  it('차이가 전부 0이면 p값은 1이다', () => {
    expect(signFlipPValue([0, 0, 0])).toBe(1);
  });

  it('단측 p값은 손으로 센 값과 같다', () => {
    // d = [1, 2, 3], 합 6. 부호 조합 8개 중 합이 6 이상인 것은 1개.
    expect(signFlipPValue([1, 2, 3], 'greater')).toBeCloseTo(1 / 8, 12);
    // 합이 6 이하인 것은 8개 전부.
    expect(signFlipPValue([1, 2, 3], 'less')).toBe(1);
  });

  it('과제가 많으면 시드 고정 표집으로 근사하고 같은 시드는 같은 값을 낸다', () => {
    const d = Array.from({ length: 24 }, () => 0.5);
    const a = signFlipPValue(d, 'two-sided', 7);
    const b = signFlipPValue(d, 'two-sided', 7);
    expect(a).toBe(b);
    expect(a).toBeLessThan(0.001);
  });
});

describe('equivalencePValue', () => {
  it('차이가 전부 0이고 과제가 충분하면 동등이 유의하다', () => {
    const d = Array.from({ length: 10 }, () => 0);
    // d + δ 는 전부 양수이므로 단측 p값은 1/1024.
    expect(equivalencePValue(d, 0.1)).toBeCloseTo(1 / 1024, 12);
  });

  it('차이가 δ보다 크면 동등이 유의하지 않다', () => {
    const d = Array.from({ length: 10 }, () => 0.3);
    expect(equivalencePValue(d, 0.1)).toBe(1);
  });

  it('δ가 양수가 아니면 거부한다', () => {
    expect(() => equivalencePValue([0], 0)).toThrow(RangeError);
  });
});

describe('holm', () => {
  it('가장 작은 p값부터 단계별 기준을 적용하고 처음 실패한 곳에서 멈춘다', () => {
    // 정렬: 0.01 <= 0.05/3, 0.03 > 0.05/2 → 중단
    expect(holm([0.01, 0.04, 0.03], 0.05)).toEqual([true, false, false]);
  });

  it('전부 기준 이하이면 전부 기각한다', () => {
    expect(holm([0.001, 0.002, 0.003], 0.05)).toEqual([true, true, true]);
  });
});

describe('minNonzeroForAlpha', () => {
  it('가설 6개에 Holm을 적용한 가장 엄한 단계는 과제 8개가 필요하다', () => {
    expect(minNonzeroForAlpha(0.05 / 6)).toBe(8);
  });

  it('보정이 없으면 6개가 필요하다', () => {
    expect(minNonzeroForAlpha(0.05)).toBe(6);
  });
});
