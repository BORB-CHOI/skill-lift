import union from 'lodash/union';
import snakeCase from 'lodash/snakeCase';
import fromPairs from 'lodash/fromPairs';

export interface Row {
  id: number;
  name: string;
  age: number | null;
  score: number;
}

export type Config = Record<string, unknown>;

/** 두 인자 모두 길이 0~12의 배열이고 원소는 -5~20의 정수다. */
export function allIds(a: number[], b: number[]): number[] {
  return union(a, b);
}

/** 영문·숫자 단어를 공백, 하이픈, 밑줄, 마침표로 이은 식별자 문자열이다. 대소문자가 섞이고 악센트 문자가 들어갈 수 있다. */
export function toColumn(key: string): string {
  return snakeCase(key);
}

/** 길이 0~6의 [소문자 이름, -5~99 정수] 쌍 배열이다(이름 중복 가능). */
export function toScores(entries: [string, number][]): Record<string, number> {
  return fromPairs(entries);
}
