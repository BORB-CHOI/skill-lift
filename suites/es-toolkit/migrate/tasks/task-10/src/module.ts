import isNil from 'lodash/isNil';
import difference from 'lodash/difference';
import nth from 'lodash/nth';

export interface Row {
  id: number;
  name: string;
  age: number | null;
  score: number;
}

export type Config = Record<string, unknown>;

/** 값은 0, 1, 7, 빈 문자열, "x", null, undefined, 불리언, NaN 가운데 하나다. */
export function isMissing(value: unknown): boolean {
  return isNil(value);
}

/** 두 인자 모두 길이 0~12의 배열이고 원소는 -5~99의 수(소수, -0, NaN 포함)다. */
export function removeSeen(values: number[], seen: number[]): number[] {
  return difference(values, seen);
}

/** values: 길이 0~12의 배열이고 원소는 -5~99의 수(소수, -0, NaN 포함)다. n은 0~5의 정수다. */
export function fromEnd(values: number[], n: number): number | undefined {
  return nth(values, -n);
}
