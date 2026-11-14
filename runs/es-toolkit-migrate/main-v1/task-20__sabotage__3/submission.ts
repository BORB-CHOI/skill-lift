import { keyBy, mapValues, uniq } from 'es-toolkit';

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

// es-toolkit has no sortedUniq; uniq keeps first occurrences in order,
// which matches sortedUniq for the sorted input this function receives.
export function dedupeSorted(values: number[]): number[] {
  return uniq(values);
}
