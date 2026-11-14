import { describe, expect, it } from 'vitest';
import { structuralEqual } from '../../src/graders/equal.js';

describe('structuralEqual', () => {
  it('NaN은 NaN과 같고 +0과 -0은 다르다', () => {
    expect(structuralEqual(NaN, NaN)).toBe(true);
    expect(structuralEqual(0, -0)).toBe(false);
  });

  it('객체의 키 순서는 보지 않는다', () => {
    expect(structuralEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });

  it('키 집합이 다르면 다르다', () => {
    expect(structuralEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
  });

  it('배열은 순서와 길이를 본다', () => {
    expect(structuralEqual([1, 2], [2, 1])).toBe(false);
    expect(structuralEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(structuralEqual([[1], [2, 3]], [[1], [2, 3]])).toBe(true);
  });

  it('희소 배열의 빈 칸은 undefined와 구분한다', () => {
    // eslint-disable-next-line no-sparse-arrays
    expect(structuralEqual([1, , 3], [1, undefined, 3])).toBe(false);
  });

  it('배열과 객체는 서로 다르다', () => {
    expect(structuralEqual([], {})).toBe(false);
  });

  it('프로토타입은 보지 않는다', () => {
    const bare = Object.assign(Object.create(null) as Record<string, unknown>, { a: 1 });
    expect(structuralEqual(bare, { a: 1 })).toBe(true);
  });

  it('Date, Map, Set을 값으로 비교한다', () => {
    expect(structuralEqual(new Date(5), new Date(5))).toBe(true);
    expect(structuralEqual(new Date(5), new Date(6))).toBe(false);
    expect(structuralEqual(new Map([['a', 1]]), new Map([['a', 1]]))).toBe(true);
    expect(structuralEqual(new Set([1, 2]), new Set([1, 3]))).toBe(false);
    expect(structuralEqual(new Map(), new Set())).toBe(false);
  });

  it('순환 참조가 있어도 끝난다', () => {
    const a: Record<string, unknown> = { v: 1 };
    a['self'] = a;
    const b: Record<string, unknown> = { v: 1 };
    b['self'] = b;
    expect(structuralEqual(a, b)).toBe(true);
    b['v'] = 2;
    expect(structuralEqual(a, b)).toBe(false);
  });
});
