import { merge, zipObject } from 'es-toolkit';
// Main-entry startCase lowercases the rest of each word; lodash keeps it
// (e.g. "USER name" -> "USER Name"), so compat is required to preserve behaviour.
import { startCase } from 'es-toolkit/compat';

export interface Row {
  id: number;
  name: string;
  age: number;
}

export type Config = Record<string, unknown>;

export function applyPatch(base: Config, patch: Config): Config {
  return merge(base, patch);
}

export function toTitle(key: string): string {
  return startCase(key);
}

export function toLookup(pairs: [string, number][]): Record<string, number> {
  return zipObject(
    pairs.map((p) => p[0]),
    pairs.map((p) => p[1]),
  );
}
