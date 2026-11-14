import { keyBy, uniq } from 'es-toolkit/array';
import { sumBy } from 'es-toolkit/math';

export interface Row {
  id: number;
  name: string;
  age: number;
}

export type Config = Record<string, unknown>;

export function byId(rows: Row[]): Record<string, Row> {
  return keyBy(rows, (row) => row.id);
}

export function totalAge(rows: Row[]): number {
  return sumBy(rows, (row) => row.age);
}

// uniq keeps the first occurrence of each value, so on sorted input it equals sortedUniq.
export function dedupeSorted(values: number[]): number[] {
  return uniq(values);
}
