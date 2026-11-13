import camelCase from 'lodash/camelCase';
import startCase from 'lodash/startCase';
import truncate from 'lodash/truncate';

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

export function preview(text: string): string {
  return truncate(text, { length: 24 });
}
