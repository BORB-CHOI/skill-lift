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

// For sorted input, uniq keeps the first of each run of equal values,
// which is exactly what lodash's sortedUniq returns.
export function dedupeSorted(values: number[]): number[] {
  return uniq(values);
}
