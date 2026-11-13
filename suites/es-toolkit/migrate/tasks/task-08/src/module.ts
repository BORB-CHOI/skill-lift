import kebabCase from 'lodash/kebabCase';
import keyBy from 'lodash/keyBy';
import toNumber from 'lodash/toNumber';

export interface Row {
  id: number;
  name: string;
  age: number;
}

export type Config = Record<string, unknown>;

export function toSlug(label: string): string {
  return kebabCase(label);
}

export function byNameKey(rows: Row[]): Record<string, Row> {
  return keyBy(rows, 'name');
}

export function parseAmount(text: string): number {
  return toNumber(text);
}
