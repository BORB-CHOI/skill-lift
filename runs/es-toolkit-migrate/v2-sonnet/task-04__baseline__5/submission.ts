
import { mapValues, keyBy } from 'es-toolkit';

export interface Row {
  id: number;
  name: string;
  age: number;
}

export type Config = Record<string, unknown>;

export function doubled(scores: Record<string, number>): Record<string, number> {
  return mapValues(scores, (score) => score * 2);
}

export function byNameKey(rows: Row[]): Record<string, Row> {
  return keyBy(rows, (row) => row.name);
}

export function toLookup(pairs: [string, number][]): Record<string, number> {
  return mapValues(keyBy(pairs, (p) => p[0]), (p) => p[1]);
}
