import { merge, upperFirst, words } from 'es-toolkit';
import { fromPairs } from 'es-toolkit/compat';

export interface Row {
  id: number;
  name: string;
  age: number;
}

export type Config = Record<string, unknown>;

export function applyPatch(base: Config, patch: Config): Config {
  return merge(base, patch);
}

// es-toolkit's startCase lowercases the rest of each word ('ABC' -> 'Abc'),
// lodash's only upper-cases the first letter. Compose the same word split
// with upperFirst to keep lodash's output for upper-case runs.
export function toTitle(key: string): string {
  return words(key).map(upperFirst).join(' ');
}

export function toLookup(pairs: [string, number][]): Record<string, number> {
  return fromPairs(pairs);
}
