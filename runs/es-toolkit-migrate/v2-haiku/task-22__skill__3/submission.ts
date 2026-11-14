import words from 'es-toolkit/compat/words';
import { groupBy } from 'es-toolkit/array';
import isEmpty from 'es-toolkit/compat/isEmpty';

export interface Row {
  id: number;
  name: string;
  age: number;
}

export type Config = Record<string, unknown>;

export function tokens(text: string): string[] {
  return words(text);
}

export function byAge(rows: Row[]): Record<string, Row[]> {
  // groupBy keys are numeric here; object keys are strings at runtime, so this cast only changes the type.
  return groupBy(rows, row => row.age) as Record<string, Row[]>;
}

export function isBlank(value: unknown): boolean {
  return isEmpty(value);
}
