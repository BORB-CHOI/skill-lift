import { keyBy, mapValues } from 'es-toolkit';
// The main entry has no `isEmpty` (only `isEmptyObject`, which is not equivalent),
// so the lodash-compatible `isEmpty` comes from es-toolkit/compat.
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
