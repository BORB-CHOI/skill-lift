import pick from 'lodash/pick';
import sumBy from 'lodash/sumBy';
import toNumber from 'lodash/toNumber';

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
  return sumBy(rows, 'age');
}

export function parseAmount(text: string): number {
  return toNumber(text);
}
