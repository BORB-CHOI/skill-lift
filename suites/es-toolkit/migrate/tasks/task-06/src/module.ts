import invert from 'lodash/invert';
import intersectionBy from 'lodash/intersectionBy';
import size from 'lodash/size';

export interface Row {
  id: number;
  name: string;
  age: number | null;
  score: number;
}

export type Config = Record<string, unknown>;

/** 키와 값이 모두 소문자 이름인 객체다(값 중복 가능, 키 0~5개). */
export function byValue(map: Record<string, string>): Record<string, string> {
  return invert(map);
}

/** 두 인자 모두 길이 0~12의 배열이고 원소는 -5~99의 수(소수, -0, NaN 포함)다. */
export function commonByFloor(a: number[], b: number[]): number[] {
  return intersectionBy(a, b, Math.floor);
}

/** 값은 사용자 입력 문자열(이모지 포함), 배열, 설정 객체 가운데 하나다. */
export function countOf(value: string | unknown[] | Config): number {
  return size(value);
}
