import groupBy from 'lodash/groupBy';
import uniqBy from 'lodash/uniqBy';
import fromPairs from 'lodash/fromPairs';
import sortedUniq from 'lodash/sortedUniq';

export interface Row {
  id: number;
  name: string;
}

export function byName(rows: Row[]): Record<string, Row[]> {
  return groupBy(rows, (row) => row.name);
}

export function uniqueRows(rows: Row[]): Row[] {
  return uniqBy(rows, 'id');
}

export function toLookup(pairs: [string, number][]): Record<string, number> {
  return fromPairs(pairs);
}

export function dedupeSorted(values: number[]): number[] {
  return sortedUniq(values);
}
