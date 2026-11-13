// kebabCase: the compat export is used because the strict es-toolkit kebabCase
// splits digits and uppercase runs differently from lodash (e.g. "69THao").
import { kebabCase, toNumber } from 'es-toolkit/compat';
// keyBy: strict es-toolkit keyBy takes a key function, so lodash's 'name'
// property shorthand becomes a one-line adapter below.
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
  return keyBy(rows, (row) => row.name);
}

// toNumber: only exists in es-toolkit/compat; it is Number() with a symbol guard,
// which matches lodash toNumber for strings.
export function parseAmount(text: string): number {
  return toNumber(text);
}
