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

// sortedUniq is not provided by es-toolkit. uniq keeps the first occurrence in
// order, so on sorted input it returns the same result as sortedUniq.
export function dedupeSorted(values: number[]): number[] {
  return uniq(values);
}
