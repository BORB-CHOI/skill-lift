import { groupBy } from 'es-toolkit/array';
import { isEmpty, words } from 'es-toolkit/compat';

export interface Row {
  id: number;
  name: string;
  age: number;
}

export type Config = Record<string, unknown>;

// es-toolkit/compat's words() uses lodash's own word patterns, so it splits
// ordinals and acronyms exactly as lodash does (e.g. '1ST', '1stA').
export function tokens(text: string): string[] {
  return words(text);
}

// String(...) matches lodash's property-keyed grouping, where keys are coerced to strings.
export function byAge(rows: Row[]): Record<string, Row[]> {
  return groupBy(rows, (row) => String(row.age));
}

// es-toolkit/compat's isEmpty() follows lodash for null, primitives, strings, arrays and objects.
export function isBlank(value: unknown): boolean {
  return isEmpty(value);
}
