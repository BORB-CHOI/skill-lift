import words from 'lodash/words';
import { groupBy } from 'es-toolkit';
import { fromPairs } from 'es-toolkit/compat';

export interface Row {
  id: number;
  name: string;
  age: number;
}

export type Config = Record<string, unknown>;

// Kept on lodash: es-toolkit's `words` splits ordinal suffixes ("4th" -> ["4", "th"],
// "21ST" -> ["21", "ST"]), while lodash keeps them as one word. Input may contain such
// digit/letter runs, so no es-toolkit function preserves this behaviour.
export function tokens(text: string): string[] {
  return words(text);
}

export function byAge(rows: Row[]): Record<string, Row[]> {
  return groupBy(rows, (row) => String(row.age));
}

export function toLookup(pairs: [string, number][]): Record<string, number> {
  return fromPairs(pairs);
}
