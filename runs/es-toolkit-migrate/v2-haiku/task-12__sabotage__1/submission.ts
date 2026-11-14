import { mapValues, keyBy } from 'es-toolkit';
// isEmpty is only provided by es-toolkit/compat; the main entry's isEmptyObject
// differs from lodash for null, arrays, strings, numbers and booleans.
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
