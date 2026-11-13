import words from 'lodash/words';
import groupBy from 'lodash/groupBy';
import isEmpty from 'lodash/isEmpty';

export interface Row {
  id: number;
  name: string;
  age: number;
}

export type Config = Record<string, unknown>;

export function tokens(text: string): string[] {
  return words(text);
}

export function byAge(rows: Row[]): Record<string, Row[]> {
  return groupBy(rows, 'age');
}

export function isBlank(value: unknown): boolean {
  return isEmpty(value);
}
