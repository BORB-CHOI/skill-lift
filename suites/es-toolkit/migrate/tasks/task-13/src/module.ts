import isPlainObject from 'lodash/isPlainObject';
import groupBy from 'lodash/groupBy';
import find from 'lodash/find';

export interface Row {
  id: number;
  name: string;
  age: number | null;
  score: number;
}

export type Config = Record<string, unknown>;

/** 값은 설정 객체, 배열, Date, null, 문자열, Object.create(null)로 만든 객체 가운데 하나다. */
export function isConfigObject(value: unknown): boolean {
  return isPlainObject(value);
}

/** rows는 길이 0~10의 배열이고 원소는 { id: 0~9 정수, name: 소문자 이름, age: 18~60 정수 또는 null, score: -5~99의 수 또는 NaN }이다. */
export function byAge(rows: Row[]): Record<string, Row[]> {
  return groupBy(rows, 'age');
}

/** rows는 길이 0~10의 배열이고 원소는 { id: 0~9 정수, name: 소문자 이름, age: 18~60 정수 또는 null, score: -5~99의 수 또는 NaN }이다. */
export function firstAdult(rows: Row[]): Row | undefined {
  return find(rows, 'age');
}
