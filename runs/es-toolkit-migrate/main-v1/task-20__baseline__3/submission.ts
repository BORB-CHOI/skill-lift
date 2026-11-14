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

// Input is sorted ascending, so an order-preserving de-duplication is equivalent
// to lodash's sortedUniq here (es-toolkit has no sortedUniq).
export function dedupeSorted(values: number[]): number[] {
  return uniq(values);
}
