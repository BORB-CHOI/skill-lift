import words from 'es-toolkit/compat/words';
import { groupBy } from 'es-toolkit/array';
import fromPairs from 'es-toolkit/compat/fromPairs';

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

export function toLookup(pairs: [string, number][]): Record<string, number> {
  return fromPairs(pairs);
}
