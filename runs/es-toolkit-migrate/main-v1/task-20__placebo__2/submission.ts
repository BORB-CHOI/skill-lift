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

// es-toolkit has no sortedUniq; uniq keeps the first occurrence of each value,
// which for an already-sorted input is the same result.
export function dedupeSorted(values: number[]): number[] {
  return uniq(values);
}
