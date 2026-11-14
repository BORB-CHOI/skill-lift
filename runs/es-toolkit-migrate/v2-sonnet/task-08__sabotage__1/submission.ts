import { kebabCase, keyBy } from 'es-toolkit';

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
  return keyBy(rows, (r) => r.name);
}

export function parseAmount(text: string): number {
  return Number(text);
}
