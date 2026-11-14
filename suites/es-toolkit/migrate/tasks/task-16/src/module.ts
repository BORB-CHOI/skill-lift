import inRange from 'lodash/inRange';
import uniqBy from 'lodash/uniqBy';
import isMatch from 'lodash/isMatch';

export interface Row {
  id: number;
  name: string;
  age: number | null;
  score: number;
}

export type Config = Record<string, unknown>;

/** age는 -5~99의 수(소수, -0, NaN 포함)다. */
export function isWorkingAge(age: number): boolean {
  return inRange(age, 18, 65);
}

/** 길이 0~12의 배열이고 원소는 -5~99의 수(소수, -0, NaN 포함)다. */
export function dedupeByFloor(values: number[]): number[] {
  return uniqBy(values, Math.floor);
}

/** row는 rows의 원소 형태이고 filter는 그 필드 일부를 가진 객체다. */
export function matchesFilter(row: Row, filter: Partial<Row>): boolean {
  return isMatch(row, filter);
}
