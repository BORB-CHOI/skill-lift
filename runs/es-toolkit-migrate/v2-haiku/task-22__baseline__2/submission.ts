import { words as esWords } from 'es-toolkit/string';
import { groupBy as esGroupBy } from 'es-toolkit/array';
import { isEmpty } from 'es-toolkit/compat';

export interface Row {
  id: number;
  name: string;
  age: number;
}

export type Config = Record<string, unknown>;

export function tokens(text: string): string[] {
  return esWords(text);
}

export function byAge(rows: Row[]): Record<string, Row[]> {
  return esGroupBy(rows, (row) => String(row.age));
}

export function isBlank(value: unknown): boolean {
  return isEmpty(value);
}
