// `merge` comes from the main entry: it matches lodash for every input in range and is the smallest option.
// `startCase` and `fromPairs` come from `es-toolkit/compat`: the main-entry `startCase` lowercases the rest
// of each word (`HELLO WORLD` -> `Hello World`), and `fromPairs` is only exported from `compat`.
import { merge } from 'es-toolkit';
import { startCase, fromPairs } from 'es-toolkit/compat';

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
  return fromPairs(pairs);
}
