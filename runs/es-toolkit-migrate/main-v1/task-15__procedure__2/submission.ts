import { keyBy } from 'es-toolkit/array/keyBy';
import { sumBy } from 'es-toolkit/math/sumBy';
import { uniq } from 'es-toolkit/array/uniq';

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

export function dedupeSorted(values: number[]): number[] {
  return uniq(values);
}
