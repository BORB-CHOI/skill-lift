import flattenDeep from 'lodash/flattenDeep';
import intersection from 'lodash/intersection';
import toNumber from 'lodash/toNumber';

export interface Row {
  id: number;
  name: string;
  age: number | null;
  score: number;
}

export type Config = Record<string, unknown>;

/** 깊이 3 이하로 중첩된 정수 배열이다(빈 배열 포함). */
export function flatIds(tree: unknown[]): unknown[] {
  return flattenDeep(tree);
}

/** 두 인자 모두 길이 0~12의 배열이고 원소는 -5~20의 정수다. */
export function commonIds(a: number[], b: number[]): number[] {
  return intersection(a, b);
}

/** 길이 0~8의 문자열이고 숫자, 소수점, 부호, 공백, 영문자 e와 x로 이루어진다. */
export function parseAmount(text: string): number {
  return toNumber(text);
}
