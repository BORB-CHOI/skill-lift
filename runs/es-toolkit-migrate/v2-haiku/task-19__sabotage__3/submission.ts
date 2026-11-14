import { pick, sumBy, zipObject } from 'es-toolkit';

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
  return sumBy(rows, row => row.age);
}

export function toLookup(pairs: [string, number][]): Record<string, number> {
  return zipObject(
    pairs.map(pair => pair[0]),
    pairs.map(pair => pair[1]),
  );
}
