import { keyBy, uniq } from 'es-toolkit/array';
import { sumBy } from 'es-toolkit/math';

export interface Row {
  id: number;
  name: string;
  age: number;
}

export type Config = Record<string, unknown>;

export function byId(rows: Row[]): Record<string, Row> {
  // keyBy keys by number; object keys are strings at runtime, so this is only a type-level adapter.
  return keyBy(rows, (row) => row.id) as Record<string, Row>;
}

export function totalAge(rows: Row[]): number {
  return sumBy(rows, (row) => row.age);
}

// es-toolkit has no sortedUniq. For sorted input, uniq (first occurrence, Set-based) yields the same result.
export function dedupeSorted(values: number[]): number[] {
  return uniq(values);
}
