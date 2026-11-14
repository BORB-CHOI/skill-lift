import { merge, upperFirst } from 'es-toolkit';
import words from 'es-toolkit/compat/words';
import fromPairs from 'es-toolkit/compat/fromPairs';

export interface Row {
  id: number;
  name: string;
  age: number;
}

export type Config = Record<string, unknown>;

export function applyPatch(base: Config, patch: Config): Config {
  return merge(base, patch);
}

// Lodash-compatible word splitting (ordinals such as "1st" stay whole), then upper-case the first letter of each word.
export function toTitle(key: string): string {
  return words(key).map(w => upperFirst(w)).join(' ');
}

export function toLookup(pairs: [string, number][]): Record<string, number> {
  return fromPairs(pairs);
}
