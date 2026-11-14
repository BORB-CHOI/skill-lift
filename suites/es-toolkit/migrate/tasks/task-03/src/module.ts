import upperFirst from 'lodash/upperFirst';
import words from 'lodash/words';
import indexOf from 'lodash/indexOf';

export interface Row {
  id: number;
  name: string;
  age: number | null;
  score: number;
}

export type Config = Record<string, unknown>;

/** 길이 20자 이하의 사용자 입력 문자열이다. 라틴·한글·일본어 문자, 이모지, 숫자, 공백, 구두점을 포함할 수 있다. */
export function toSentence(text: string): string {
  return upperFirst(text);
}

/** 길이 40자 이하의 사용자 입력 문자열이다. 라틴·한글·일본어 문자, 이모지, 숫자, 공백, 구두점을 포함할 수 있다. */
export function tokenize(text: string): string[] {
  return words(text);
}

/** values: 길이 0~12의 배열이고 원소는 -5~99의 수(소수, -0, NaN 포함)다. target도 같은 범위의 수다. */
export function positionOf(values: number[], target: number): number {
  return indexOf(values, target);
}
