import uniq from 'lodash/uniq';
import countBy from 'lodash/countBy';
import map from 'lodash/map';

export interface Row {
  id: number;
  name: string;
  age: number | null;
  score: number;
}

export type Config = Record<string, unknown>;

/** 길이 0~8의 배열이고 원소는 소문자 이름이나 빈 문자열이다(중복 가능). */
export function distinctNames(names: string[]): string[] {
  return uniq(names);
}

/** rows는 길이 0~10의 배열이고 원소는 { id: 0~9 정수, name: 소문자 이름, age: 18~60 정수 또는 null, score: -5~99의 수 또는 NaN }이다. */
export function countNames(rows: Row[]): Record<string, number> {
  return countBy(rows, 'name');
}

/** rows는 길이 0~10의 배열이고 원소는 { id: 0~9 정수, name: 소문자 이름, age: 18~60 정수 또는 null, score: -5~99의 수 또는 NaN }이다. null일 수 있다. */
export function namesOf(rows: Row[] | null): string[] {
  return map(rows, 'name');
}
