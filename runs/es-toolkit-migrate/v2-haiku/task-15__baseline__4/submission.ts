import { keyBy, sumBy, uniq } from 'es-toolkit';

export interface Row {
  id: number;
  name: string;
  age: number;
}

export type Config = Record<string, unknown>;

export function byId(rows: Row[]): Record<string, Row> {
  return keyBy(rows, (row) => row.id) as Record<string, Row>;
}

export function totalAge(rows: Row[]): number {
  return sumBy(rows, (row) => row.age);
}

// Input is sorted ascending, so uniq (first-occurrence, order-preserving)
// gives the same result as lodash sortedUniq.
export function dedupeSorted(values: number[]): number[] {
  return uniq(values);
}
