import flatten from 'lodash/flatten';
import maxBy from 'lodash/maxBy';
import padStart from 'lodash/padStart';

export interface Row {
  id: number;
  name: string;
  age: number | null;
  score: number;
}

export type Config = Record<string, unknown>;

/** 길이 0~4의 배열이고 원소는 길이 0~12의 배열이고 원소는 -5~20의 정수다. */
export function joinPages(pages: number[][]): number[] {
  return flatten(pages);
}

/** rows는 길이 0~10의 배열이고 원소는 { id: 0~9 정수, name: 소문자 이름, age: 18~60 정수 또는 null, score: -5~99의 수 또는 NaN }이다. */
export function oldest(rows: Row[]): Row | undefined {
  return maxBy(rows, 'age');
}

/** n은 -5~99의 수(소수, -0, NaN 포함)다. */
export function toCode(n: number): string {
  return padStart(String(n), 4, '0');
}
