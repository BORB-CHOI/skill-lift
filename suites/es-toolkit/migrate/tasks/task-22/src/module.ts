import kebabCase from 'lodash/kebabCase';
import dropWhile from 'lodash/dropWhile';
import without from 'lodash/without';

export interface Row {
  id: number;
  name: string;
  age: number | null;
  score: number;
}

export type Config = Record<string, unknown>;

/** 영문 소문자와 대문자로만 이루어진 camelCase 속성 이름이다(길이 0~20). */
export function toCssName(key: string): string {
  return kebabCase(key);
}

/** 길이 0~12의 배열이고 원소는 -5~99의 수(소수, -0, NaN 포함)다. */
export function skipNegatives(values: number[]): number[] {
  return dropWhile(values, (v) => v < 0);
}

/** 길이 0~12의 배열이고 원소는 -5~99의 수(소수, -0, NaN 포함)다. */
export function dropZeros(values: number[]): number[] {
  return without(values, 0);
}
