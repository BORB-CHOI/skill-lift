import deburr from 'lodash/deburr';
import sum from 'lodash/sum';
import has from 'lodash/has';

export interface Row {
  id: number;
  name: string;
  age: number | null;
  score: number;
}

export type Config = Record<string, unknown>;

/** 길이 30자 이하의 사용자 입력 문자열이다. 라틴·한글·일본어 문자, 이모지, 숫자, 공백, 구두점을 포함할 수 있다. */
export function foldAccents(name: string): string {
  return deburr(name);
}

/** 길이 0~12의 배열이고 원소는 -5~99의 수(소수, -0, NaN 포함)다. */
export function total(values: number[]): number {
  return sum(values);
}

/** config: 깊이 2 이하의 설정 객체다. 키는 정해진 설정 키이고 값은 정수, 문자열, 불리언, null 또는 객체다. key는 설정 키나 점 경로, 또는 그 배열이다. */
export function hasSetting(config: Config, key: string | string[]): boolean {
  return has(config, key);
}
