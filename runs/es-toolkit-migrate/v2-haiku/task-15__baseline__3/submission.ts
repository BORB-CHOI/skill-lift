import { keyBy, sumBy, uniq } from 'es-toolkit';

export interface Row {
  id: number;
  name: string;
  age: number;
}

export type Config = Record<string, unknown>;

export function byId(rows: Row[]): Record<string, Row> {
  return keyBy(rows, (row) => String(row.id));
}

export function totalAge(rows: Row[]): number {
  return sumBy(rows, (row) => row.age);
}

// uniq keeps the first occurrence of each value, so on sorted input it matches
// lodash's sortedUniq (which es-toolkit does not export at the root).
export function dedupeSorted(values: number[]): number[] {
  return uniq(values);
}
