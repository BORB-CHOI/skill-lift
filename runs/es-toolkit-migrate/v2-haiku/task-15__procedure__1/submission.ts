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

// `sortedUniq` has no es-toolkit equivalent. On sorted input, `uniq` keeps the
// first occurrence of each value in order, which is the same result.
export function dedupeSorted(values: number[]): number[] {
  return uniq(values);
}
