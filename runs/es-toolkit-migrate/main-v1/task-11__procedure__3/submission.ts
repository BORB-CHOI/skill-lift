import { pick } from 'es-toolkit/object';
import { sumBy } from 'es-toolkit/math';
import truncate from 'es-toolkit/compat/truncate';

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

export function preview(text: string): string {
  return truncate(text, { length: 24 });
}
