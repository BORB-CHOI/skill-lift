import mapValues from 'lodash/mapValues';
import keyBy from 'lodash/keyBy';
import fromPairs from 'lodash/fromPairs';

export interface Row {
  id: number;
  name: string;
  age: number;
}

export type Config = Record<string, unknown>;

export function doubled(scores: Record<string, number>): Record<string, number> {
  return mapValues(scores, (score) => score * 2);
}

export function byNameKey(rows: Row[]): Record<string, Row> {
  return keyBy(rows, 'name');
}

export function toLookup(pairs: [string, number][]): Record<string, number> {
  return fromPairs(pairs);
}
