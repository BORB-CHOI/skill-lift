import words from 'es-toolkit/compat/words';
import truncate from 'es-toolkit/compat/truncate';
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
  return groupBy(rows, (row) => row.age);
}

export function preview(text: string): string {
  return truncate(text, { length: 24 });
}
