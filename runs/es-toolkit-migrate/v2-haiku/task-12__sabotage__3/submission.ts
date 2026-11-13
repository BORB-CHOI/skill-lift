import { mapValues, keyBy } from 'es-toolkit';
// es-toolkit's main entry has no `isEmpty`; its `isEmptyObject` differs from lodash
// (e.g. null, [], numbers, booleans), so the compat implementation is the only one that matches.
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
  // es-toolkit's keyBy takes a function, not a property-name shorthand.
  return keyBy(rows, (row) => row.name);
}

export function isBlank(value: unknown): boolean {
  return isEmpty(value);
}
