import { pick } from 'es-toolkit/object/pick';
import { sumBy } from 'es-toolkit/math/sumBy';
import toNumber from 'es-toolkit/compat/toNumber';

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
  return sumBy(rows, (row: Row) => row.age);
}

export function parseAmount(text: string): number {
  return toNumber(text);
}
