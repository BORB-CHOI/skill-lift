import cloneDeep from 'lodash/cloneDeep';
import unionBy from 'lodash/unionBy';
import times from 'lodash/times';

export interface Row {
  id: number;
  name: string;
  age: number | null;
  score: number;
}

export type Config = Record<string, unknown>;

/** 깊이 2 이하의 설정 객체다. 키는 정해진 설정 키이고 값은 정수, 문자열, 불리언, null 또는 객체다. */
export function snapshot(config: Config): Config {
  return cloneDeep(config);
}

/** 두 인자 모두 길이 0~12의 배열이고 원소는 -5~99의 수(소수, -0, NaN 포함)다. */
export function mergeByFloor(a: number[], b: number[]): number[] {
  return unionBy(a, b, Math.floor);
}

/** count는 0~20의 정수다. */
export function emptyRows(count: number): string[] {
  return times(count, () => '');
}
