import { mapValues, keyBy } from 'es-toolkit';
// es-toolkit's main entry has no lodash-style isEmpty (it only exports isEmptyObject,
// which treats numbers, booleans and strings differently). The compat entry's isEmpty
// matches lodash's semantics for every value in the input range.
import { isEmpty } from 'es-toolkit/compat';

export interface Row {
  id: number;
  name: string;
  age: number;
}

export type Config = Record<string, unknown>;

export function doubled(scores: Record<string, number>): Record<string, number> {
  return mapValues(scores, (score) => score * 2);
}

export function byNameKey(rows: Row[]): Record<string, Row> {
  return keyBy(rows, (row) => row.name);
}

export function isBlank(value: unknown): boolean {
  return isEmpty(value);
}
