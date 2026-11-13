import { keyBy, sumBy, uniq } from 'es-toolkit';

export interface Row {
  id: number;
  name: string;
  age: number;
}

export type Config = Record<string, unknown>;

export function byId(rows: Row[]): Record<string, Row> {
  // Object keys are strings either way, so the cast only fixes the index type.
  return keyBy(rows, (row) => row.id) as Record<string, Row>;
}

export function totalAge(rows: Row[]): number {
  return sumBy(rows, (row) => row.age);
}

export function dedupeSorted(values: number[]): number[] {
  // uniq keeps first occurrences, which matches sortedUniq on sorted input.
  return uniq(values);
}
