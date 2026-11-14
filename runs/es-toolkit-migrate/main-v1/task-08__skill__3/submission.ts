import kebabCase from 'es-toolkit/compat/kebabCase';
import { keyBy } from 'es-toolkit';
import toNumber from 'es-toolkit/compat/toNumber';

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

export function parseAmount(text: string): number {
  return toNumber(text);
}
