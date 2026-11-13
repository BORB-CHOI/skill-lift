import { chunk as strictChunk, uniqBy as strictUniqBy } from 'es-toolkit';
import { uniqBy as compatUniqBy } from 'es-toolkit/compat';
import lodashChunk from 'lodash/chunk.js';
import lodashUniqBy from 'lodash/uniqBy.js';
import { describe, expect, it } from 'vitest';
import { compareBehaviour, type AnyFunction } from '../../src/graders/behaviour.js';

const fn = (f: unknown): AnyFunction => f as AnyFunction;

describe('compareBehaviour', () => {
  it('같은 동작이면 통과한다', () => {
    const r = compareBehaviour(fn(lodashChunk), fn(strictChunk), [
      [[1, 2, 3, 4, 5], 2],
      [[], 3],
      [['a'], 1],
    ]);
    expect(r).toEqual({ passed: true, checked: 3, mismatches: [] });
  });

  it('strict가 받지 않는 lodash의 문자열 iteratee에서 차이를 잡는다', () => {
    const inputs = [[[{ id: 1 }, { id: 1 }, { id: 2 }], 'id']];
    // compat은 lodash와 같은 결과를 낸다.
    expect(compareBehaviour(fn(lodashUniqBy), fn(compatUniqBy), inputs).passed).toBe(true);
    // strict는 문자열을 함수로 호출하려다 예외를 낸다.
    const strict = compareBehaviour(fn(lodashUniqBy), fn(strictUniqBy), inputs);
    expect(strict.passed).toBe(false);
    expect(strict.mismatches).toEqual([{ index: 0, reason: 'threw' }]);
  });

  it('반환값은 같아도 인자를 다르게 변경하면 잡는다', () => {
    const sortInPlace = (xs: number[]): number[] => xs.sort((a, b) => a - b);
    const sortCopy = (xs: number[]): number[] => [...xs].sort((a, b) => a - b);
    const r = compareBehaviour(fn(sortInPlace), fn(sortCopy), [[[3, 1, 2]]]);
    expect(r.mismatches).toEqual([{ index: 0, reason: 'args' }]);
  });

  it('한 구현의 인자 변경이 다른 구현의 입력에 영향을 주지 않는다', () => {
    const push = (xs: number[]): number => xs.push(9);
    const r = compareBehaviour(fn(push), fn(push), [[[1, 2]]]);
    expect(r.passed).toBe(true);
  });

  it('둘 다 예외를 내면 같은 동작으로 본다', () => {
    const boom = (): never => {
      throw new Error('a');
    };
    const bang = (): never => {
      throw new TypeError('b');
    };
    expect(compareBehaviour(fn(boom), fn(bang), [[]]).passed).toBe(true);
  });
});
