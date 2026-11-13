import { groupBy, zipObject } from 'es-toolkit';
import { words } from 'es-toolkit/compat';

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
  return groupBy(rows, (r) => r.age);
}

export function toLookup(pairs: [string, number][]): Record<string, number> {
  return zipObject(pairs.map((p) => p[0]), pairs.map((p) => p[1]));
}
