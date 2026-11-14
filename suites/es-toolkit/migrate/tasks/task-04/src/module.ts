import escape from 'lodash/escape';
import camelCase from 'lodash/camelCase';
import split from 'lodash/split';

export interface Row {
  id: number;
  name: string;
  age: number | null;
  score: number;
}

export type Config = Record<string, unknown>;

/** 길이 40자 이하의 사용자 입력 문자열이다. 라틴·한글·일본어 문자, 이모지, 숫자, 공백, 구두점을 포함할 수 있다. */
export function toHtmlText(text: string): string {
  return escape(text);
}

/** 영문·숫자 단어를 공백, 하이픈, 밑줄, 마침표로 이은 식별자 문자열이다. 대소문자가 섞이고 악센트 문자가 들어갈 수 있다. */
export function toPropName(key: string): string {
  return camelCase(key);
}

/** 길이 20자 이하의 사용자 입력 문자열이다. 라틴·한글·일본어 문자, 이모지, 숫자, 공백, 구두점을 포함할 수 있다. */
export function toChars(text: string): string[] {
  return split(text, '');
}
