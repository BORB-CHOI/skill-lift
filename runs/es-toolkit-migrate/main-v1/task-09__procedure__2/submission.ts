import { merge } from 'es-toolkit/object';
import { zipObject } from 'es-toolkit/array';
import { upperFirst, words } from 'es-toolkit/string';

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
  return words(key).map(upperFirst).join(' ');
}

export function toLookup(pairs: [string, number][]): Record<string, number> {
  return zipObject(pairs.map((p) => p[0]), pairs.map((p) => p[1]));
}
