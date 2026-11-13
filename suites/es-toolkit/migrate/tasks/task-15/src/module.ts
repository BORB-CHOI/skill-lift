import keyBy from 'lodash/keyBy';
import sumBy from 'lodash/sumBy';
import sortedUniq from 'lodash/sortedUniq';

export interface Row {
  id: number;
  name: string;
  age: number;
}

export type Config = Record<string, unknown>;

export function byId(rows: Row[]): Record<string, Row> {
  return keyBy(rows, (row) => row.id);
}

export function totalAge(rows: Row[]): number {
  return sumBy(rows, 'age');
}

export function dedupeSorted(values: number[]): number[] {
  return sortedUniq(values);
}
