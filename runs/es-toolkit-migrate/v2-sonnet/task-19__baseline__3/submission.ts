import { pick, sumBy, unzip, zipObject } from 'es-toolkit';

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
  return sumBy(rows, (r) => r.age);
}

export function toLookup(pairs: [string, number][]): Record<string, number> {
  const [keys = [], values = []] = unzip(pairs);
  return zipObject(keys as string[], values as number[]);
}
