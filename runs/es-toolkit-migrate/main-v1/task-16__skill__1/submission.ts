import kebabCase from 'es-toolkit/compat/kebabCase';
import truncate from 'es-toolkit/compat/truncate';
import { keyBy } from 'es-toolkit';

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
  return keyBy(rows, row => row.name);
}

export function preview(text: string): string {
  return truncate(text, { length: 24 });
}
