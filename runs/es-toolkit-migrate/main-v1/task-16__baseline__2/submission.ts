import { keyBy } from 'es-toolkit';
import words from 'es-toolkit/compat/words';
import truncate from 'es-toolkit/compat/truncate';

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

export function preview(text: string): string {
  return truncate(text, { length: 24 });
}
