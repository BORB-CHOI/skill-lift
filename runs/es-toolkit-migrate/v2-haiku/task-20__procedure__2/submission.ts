import { mapValues } from 'es-toolkit/object/mapValues';
import { keyBy } from 'es-toolkit/array/keyBy';
import { uniq } from 'es-toolkit/array/uniq';

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

// uniq keeps the first occurrence of each value, so on sorted input it returns
// the same result as lodash's sortedUniq. es-toolkit has no sortedUniq.
export function dedupeSorted(values: number[]): number[] {
  return uniq(values);
}
