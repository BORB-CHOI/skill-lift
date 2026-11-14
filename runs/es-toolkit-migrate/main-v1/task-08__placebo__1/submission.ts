import { keyBy } from 'es-toolkit';
import { kebabCase, toNumber } from 'es-toolkit/compat';

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
  return keyBy(rows, (row) => row.name);
}

export function parseAmount(text: string): number {
  return toNumber(text);
}
