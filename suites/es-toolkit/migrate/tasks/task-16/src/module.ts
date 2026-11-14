import kebabCase from 'lodash/kebabCase';
import keyBy from 'lodash/keyBy';
import truncate from 'lodash/truncate';

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

export function preview(text: string): string {
  return truncate(text, { length: 24 });
}
