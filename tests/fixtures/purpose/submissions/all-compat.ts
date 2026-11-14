import { camelCase, padStart, upperFirst } from 'es-toolkit/compat';

/** 사용자 입력 문자열이다. */
export function toSentence(text: string): string {
  return upperFirst(text);
}

/** 영문·숫자 단어를 이은 식별자 문자열이다. */
export function toPropName(key: string): string {
  return camelCase(key);
}

/** n은 -5~99의 수다. */
export function toCode(n: number): string {
  return padStart(String(n), 4, '0');
}
