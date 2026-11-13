import camelCase from 'lodash/camelCase';
import startCase from 'lodash/startCase';
import toNumber from 'lodash/toNumber';

export interface Row {
  id: number;
  name: string;
  age: number;
}

export type Config = Record<string, unknown>;

export function toKey(label: string): string {
  return camelCase(label);
}

export function toTitle(key: string): string {
  return startCase(key);
}

export function parseAmount(text: string): number {
  return toNumber(text);
}
