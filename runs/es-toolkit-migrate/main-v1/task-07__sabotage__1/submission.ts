import { keyBy, sumBy } from 'es-toolkit';
// es-toolkit has no isEmpty equivalent: its isEmptyObject returns false for null,
// arrays, strings and primitives, so lodash's isEmpty is kept for exact behaviour.
import isEmpty from 'lodash/isEmpty';

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
