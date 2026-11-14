import { keyBy, uniq } from 'es-toolkit/array';
import { mapValues } from 'es-toolkit/object';

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

// uniq keeps the first occurrence of each value, which equals sortedUniq on sorted input.
export function dedupeSorted(values: number[]): number[] {
  return uniq(values);
}
