import compact from 'lodash/compact';
import keyBy from 'lodash/keyBy';
import values from 'lodash/values';

export interface Row {
  id: number;
  name: string;
  age: number | null;
  score: number;
}

export type Config = Record<string, unknown>;

/** 길이 0~10의 배열이고 원소는 0, 1, 7, 빈 문자열, "x", null, undefined, 불리언, NaN 가운데 하나다. */
export function presentOnly(values: unknown[]): unknown[] {
  return compact(values);
}

/** rows는 길이 0~10의 배열이고 원소는 { id: 0~9 정수, name: 소문자 이름, age: 18~60 정수 또는 null, score: -5~99의 수 또는 NaN }이다. */
export function indexById(rows: Row[]): Record<string, Row> {
  return keyBy(rows, 'id');
}

/** 깊이 2 이하의 설정 객체다. 키는 정해진 설정 키이고 값은 정수, 문자열, 불리언, null 또는 객체다. */
export function settingValues(config: Config): unknown[] {
  return values(config);
}
