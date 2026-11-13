import pick from 'lodash/pick';
import sumBy from 'lodash/sumBy';
import truncate from 'lodash/truncate';

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

export function preview(text: string): string {
  return truncate(text, { length: 24 });
}
