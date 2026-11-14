import range from 'lodash/range';
import startCase from 'lodash/startCase';
import toString from 'lodash/toString';

export interface Row {
  id: number;
  name: string;
  age: number | null;
  score: number;
}

export type Config = Record<string, unknown>;

/** count는 0~20의 정수다. */
export function slots(count: number): number[] {
  return range(count);
}

/** 길이 30자 이하의 사용자 입력 문자열이다. 라틴·한글·일본어 문자, 이모지, 숫자, 공백, 구두점을 포함할 수 있다. */
export function toHeading(title: string): string {
  return startCase(title);
}

/** 값은 -5~99의 수, 문자열, null, undefined, 또는 이런 값의 배열(빈 칸 포함)이다. */
export function display(value: unknown): string {
  return toString(value);
}
