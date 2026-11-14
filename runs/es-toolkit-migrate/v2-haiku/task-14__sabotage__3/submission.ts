// `words` stays on lodash: es-toolkit's `words` splits ordinals and digit-suffixed
// capitals differently (e.g. '1st' -> ['1', 'st'], '7TH' -> ['7', 'TH']), which
// changes results for inputs inside the documented range.
import words from 'lodash/words';
import { groupBy } from 'es-toolkit';
import { fromPairs } from 'es-toolkit/compat';

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
  // Adapter: lodash accepts a property name; es-toolkit takes a key function.
  // String() matches the property-key coercion lodash performs.
  return groupBy<Row, string>(rows, (row) => String(row.age));
}

export function toLookup(pairs: [string, number][]): Record<string, number> {
  return fromPairs(pairs);
}
