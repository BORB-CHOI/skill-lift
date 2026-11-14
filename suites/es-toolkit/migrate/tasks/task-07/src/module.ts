import head from 'lodash/head';
import last from 'lodash/last';
import includes from 'lodash/includes';

export interface Row {
  id: number;
  name: string;
  age: number | null;
  score: number;
}

export type Config = Record<string, unknown>;

/** 길이 0~8의 배열이고 원소는 소문자 이름이나 빈 문자열이다(중복 가능). */
export function firstName(names: string[]): string | undefined {
  return head(names);
}

/** 길이 0~12의 배열이고 원소는 -5~99의 수(소수, -0, NaN 포함)다. null이나 undefined일 수 있다. */
export function latest(values: number[] | null | undefined): number | undefined {
  return last(values);
}

/** text: 길이 30자 이하의 사용자 입력 문자열이다. 라틴·한글·일본어 문자, 이모지, 숫자, 공백, 구두점을 포함할 수 있다. term은 길이 0~3의 문자열이다. */
export function mentions(text: string, term: string): boolean {
  return includes(text, term);
}
