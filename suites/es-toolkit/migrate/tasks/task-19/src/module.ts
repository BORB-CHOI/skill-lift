import takeWhile from 'lodash/takeWhile';
import minBy from 'lodash/minBy';
import every from 'lodash/every';

export interface Row {
  id: number;
  name: string;
  age: number | null;
  score: number;
}

export type Config = Record<string, unknown>;

/** 길이 0~12의 배열이고 원소는 -5~99의 수(소수, -0, NaN 포함)다. */
export function leadingPositives(values: number[]): number[] {
  return takeWhile(values, (v) => v > 0);
}

/** rows는 길이 0~10의 배열이고 원소는 { id: 0~9 정수, name: 소문자 이름, age: 18~60 정수 또는 null, score: -5~99의 수 또는 NaN }이다. */
export function lowest(rows: Row[]): Row | undefined {
  return minBy(rows, 'score');
}

/** rows는 길이 0~10의 배열이고 원소는 { id: 0~9 정수, name: 소문자 이름, age: 18~60 정수 또는 null, score: -5~99의 수 또는 NaN }이다. */
export function allScored(rows: Row[]): boolean {
  return every(rows, 'score');
}
