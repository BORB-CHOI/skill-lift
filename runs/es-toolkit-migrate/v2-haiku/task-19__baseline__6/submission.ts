import { pick } from 'es-toolkit/object';
import { sumBy } from 'es-toolkit/math';
import { zipObject } from 'es-toolkit/array';

export interface Row {
  id: number;
  name: string;
  age: number;
}

export type Config = Record<string, unknown>;

export function publicFields(row: Row): Pick<Row, 'id' | 'name'> {
  return pick(row, ['id', 'name']);
}

export function totalAge(rows: Row[]): number {
  return sumBy(rows, (row) => row.age);
}

export function toLookup(pairs: [string, number][]): Record<string, number> {
  return zipObject(pairs.map((p) => p[0]), pairs.map((p) => p[1]));
}
