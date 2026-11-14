import zipObject from 'lodash/zipObject';
import trimStart from 'lodash/trimStart';
import get from 'lodash/get';

export interface Row {
  id: number;
  name: string;
  age: number | null;
  score: number;
}

export type Config = Record<string, unknown>;

/** keys는 길이 0~5의 소문자 이름 배열이고 values는 길이 0~12의 배열이고 원소는 -5~20의 정수다. */
export function toRecord(keys: string[], values: number[]): Record<string, number> {
  return zipObject(keys, values);
}

/** 길이 20자 이하의 사용자 입력 문자열이다. 라틴·한글·일본어 문자, 이모지, 숫자, 공백, 구두점을 포함할 수 있다. */
export function stripLeading(text: string): string {
  return trimStart(text, '-_ ');
}

/** config: 깊이 2 이하의 설정 객체다. 키는 정해진 설정 키이고 값은 정수, 문자열, 불리언, null 또는 객체다. key는 설정 키나 점 경로, 또는 그 배열이다. */
export function readSetting(config: Config, key: string | string[]): unknown {
  return get(config, key, 'default');
}
