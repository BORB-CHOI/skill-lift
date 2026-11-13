import { keyBy } from 'es-toolkit';
import { sumBy } from 'es-toolkit';
import { uniq } from 'es-toolkit';

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

// sortedUniq has no es-toolkit equivalent; uniq keeps first occurrences,
// which yields the same result for the sorted input this function receives.
export function dedupeSorted(values: number[]): number[] {
  return uniq(values);
}
