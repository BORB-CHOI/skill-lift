import { groupBy } from 'es-toolkit/array';
import { isEmpty, words } from 'es-toolkit/compat';

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
  return groupBy(rows, (row) => String(row.age));
}

export function isBlank(value: unknown): boolean {
  return isEmpty(value);
}
