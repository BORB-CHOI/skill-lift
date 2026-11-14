import sortBy from 'lodash/sortBy';
import round from 'lodash/round';
import reduce from 'lodash/reduce';

export interface Row {
  id: number;
  name: string;
  age: number | null;
  score: number;
}

export type Config = Record<string, unknown>;

/** rows는 길이 0~10의 배열이고 원소는 { id: 0~9 정수, name: 소문자 이름, age: 18~60 정수 또는 null, score: -5~99의 수 또는 NaN }이다. */
export function byScore(rows: Row[]): Row[] {
  return sortBy(rows, ['score']);
}

/** value는 -5~100의 금액(소수 셋째 자리까지, -0, NaN 포함)이다. */
export function toCents(value: number): number {
  return round(value, 2);
}

/** rows는 길이 0~10의 배열이고 원소는 { id: 0~9 정수, name: 소문자 이름, age: 18~60 정수 또는 null, score: -5~99의 수 또는 NaN }이다. */
export function sumScores(rows: Row[]): number {
  return reduce(rows, (acc, r) => acc + r.score, 0);
}
