import mapValues from 'lodash/mapValues';
import xorBy from 'lodash/xorBy';
import lastIndexOf from 'lodash/lastIndexOf';

export interface Row {
  id: number;
  name: string;
  age: number | null;
  score: number;
}

export type Config = Record<string, unknown>;

/** 깊이 2 이하의 설정 객체다. 키는 정해진 설정 키이고 값은 정수, 문자열, 불리언, null 또는 객체다. */
export function flagsOf(config: Config): Record<string, boolean> {
  return mapValues(config, Boolean);
}

/** 두 인자 모두 길이 0~12의 배열이고 원소는 -5~99의 수(소수, -0, NaN 포함)다. */
export function changedByFloor(a: number[], b: number[]): number[] {
  return xorBy(a, b, Math.floor);
}

/** values: 길이 0~12의 배열이고 원소는 -5~99의 수(소수, -0, NaN 포함)다. target도 같은 범위의 수다. */
export function lastPositionOf(values: number[], target: number): number {
  return lastIndexOf(values, target);
}
