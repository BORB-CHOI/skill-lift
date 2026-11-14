import sumBy from 'lodash/sumBy';
import partition from 'lodash/partition';
import some from 'lodash/some';

export interface Row {
  id: number;
  name: string;
  age: number | null;
  score: number;
}

export type Config = Record<string, unknown>;

/** 길이 0~10의 배열이고 원소는 { qty: 0~20 정수 }다. */
export function totalQty(lines: { qty: number }[]): number {
  return sumBy(lines, (l) => l.qty);
}

/** rows는 길이 0~10의 배열이고 원소는 { id: 0~9 정수, name: 소문자 이름, age: 18~60 정수 또는 null, score: -5~99의 수 또는 NaN }이다. */
export function splitAdults(rows: Row[]): [Row[], Row[]] {
  return partition(rows, 'age');
}

/** rows는 길이 0~10의 배열이고 원소는 { id: 0~9 정수, name: 소문자 이름, age: 18~60 정수 또는 null, score: -5~99의 수 또는 NaN }이다. */
export function anyMissingAge(rows: Row[]): boolean {
  return some(rows, { age: null });
}
