import { merge, upperFirst, words, zipObject } from 'es-toolkit';

export interface Row {
  id: number;
  name: string;
  age: number;
}

export type Config = Record<string, unknown>;

export function applyPatch(base: Config, patch: Config): Config {
  return merge(base, patch);
}

// es-toolkit's startCase lowercases the rest of each word (lodash keeps it),
// so combine words + upperFirst to preserve lodash behaviour.
export function toTitle(key: string): string {
  return words(key).map(upperFirst).join(' ');
}

// es-toolkit has no fromPairs; zipObject over the two columns is the equivalent.
export function toLookup(pairs: [string, number][]): Record<string, number> {
  return zipObject(
    pairs.map((p) => p[0]),
    pairs.map((p) => p[1]),
  );
}
