import { words } from 'es-toolkit/compat';
import { isEmpty } from 'es-toolkit/compat';
import { groupBy } from 'es-toolkit/array/groupBy';

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
