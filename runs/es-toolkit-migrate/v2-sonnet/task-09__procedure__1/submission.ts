import { merge } from 'es-toolkit/object';
import { startCase } from 'es-toolkit/compat';
import { zipObject } from 'es-toolkit/array';

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
    pairs.map(p => p[0]),
    pairs.map(p => p[1]),
  );
}
