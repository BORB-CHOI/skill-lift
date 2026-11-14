import words from 'es-toolkit/compat/words';
import fromPairs from 'es-toolkit/compat/fromPairs';
import { groupBy } from 'es-toolkit/array';

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
  return groupBy(rows, (row) => row.age) as Record<string, Row[]>;
}

export function toLookup(pairs: [string, number][]): Record<string, number> {
  return fromPairs(pairs);
}
