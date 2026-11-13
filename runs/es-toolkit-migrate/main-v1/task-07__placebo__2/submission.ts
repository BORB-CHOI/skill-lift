import { keyBy } from 'es-toolkit/array/keyBy';
import { sumBy } from 'es-toolkit/math/sumBy';
import isEmpty from 'es-toolkit/compat/isEmpty';

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

export function isBlank(value: unknown): boolean {
  return isEmpty(value);
}
