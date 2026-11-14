import words from 'es-toolkit/compat/words';
import { keyBy } from 'es-toolkit/array';
import toNumber from 'es-toolkit/compat/toNumber';

export interface Row {
  id: number;
  name: string;
  age: number;
}

export type Config = Record<string, unknown>;

export function toSlug(label: string): string {
  return words(label).map((word) => word.toLowerCase()).join('-');
}

export function byNameKey(rows: Row[]): Record<string, Row> {
  return keyBy(rows, (row) => row.name);
}

export function parseAmount(text: string): number {
  return toNumber(text);
}
