import { merge } from 'es-toolkit/object';
import words from 'es-toolkit/compat/words';
import { upperFirst } from 'es-toolkit/string';
import isEmpty from 'es-toolkit/compat/isEmpty';

export interface Row {
  id: number;
  name: string;
  age: number;
}

export type Config = Record<string, unknown>;

export function applyPatch(base: Config, patch: Config): Config {
  return merge(base, patch);
}

// Same result as lodash startCase for these inputs: split into words, then upper-case the first letter of each.
export function toTitle(key: string): string {
  return words(key).map(upperFirst).join(' ');
}

export function isBlank(value: unknown): boolean {
  return isEmpty(value);
}
