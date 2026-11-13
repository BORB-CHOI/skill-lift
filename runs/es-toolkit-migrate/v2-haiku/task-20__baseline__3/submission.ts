import { mapValues } from 'es-toolkit/object';
import { keyBy, uniq } from 'es-toolkit/array';

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

// The input is sorted ascending, so dropping duplicates over the whole array
// yields the same result as dropping only consecutive duplicates.
export function dedupeSorted(values: number[]): number[] {
  return uniq(values);
}
