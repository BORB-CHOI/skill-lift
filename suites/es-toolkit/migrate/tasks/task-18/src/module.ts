import isEqual from 'lodash/isEqual';
import chunk from 'lodash/chunk';
import isEmpty from 'lodash/isEmpty';

export interface Row {
  id: number;
  name: string;
  age: number | null;
  score: number;
}

export type Config = Record<string, unknown>;

/** 두 인자 모두 깊이 2 이하의 설정 객체다. 키는 정해진 설정 키이고 값은 정수, 문자열, 불리언, null 또는 객체다. */
export function sameConfig(a: Config, b: Config): boolean {
  return isEqual(a, b);
}

/** items: 길이 0~12의 배열이고 원소는 -5~20의 정수다. size는 0~5의 정수다. */
export function pages(items: number[], size: number): number[][] {
  return chunk(items, size);
}

/** 값은 문자열, 수, 불리언, null, undefined, 배열, 설정 객체 가운데 하나다. */
export function isBlank(value: unknown): boolean {
  return isEmpty(value);
}
