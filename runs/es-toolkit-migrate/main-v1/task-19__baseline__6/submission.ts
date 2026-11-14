import { pick } from 'es-toolkit/object';
import { sumBy } from 'es-toolkit/math';
import { fromPairs } from 'es-toolkit/compat';

export interface Row {
  id: number;
  name: string;
  age: number;
}

export type Config = Record<string, unknown>;

export function publicFields(row: Row): Pick<Row, 'id' | 'name'> {
  return pick(row, ['id', 'name'] as const);
}

export function totalAge(rows: Row[]): number {
  return sumBy(rows, (row) => row.age);
}

export function toLookup(pairs: [string, number][]): Record<string, number> {
  return fromPairs(pairs);
}
