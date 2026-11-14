import { pick } from 'es-toolkit';
import { sumBy } from 'es-toolkit';
import { toNumber } from 'es-toolkit/compat';

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
  return sumBy(rows, r => r.age);
}

export function parseAmount(text: string): number {
  return toNumber(text);
}
