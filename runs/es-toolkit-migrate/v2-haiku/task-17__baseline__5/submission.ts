import { merge, upperFirst } from 'es-toolkit';
import words from 'es-toolkit/compat/words';
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

export function toTitle(key: string): string {
  return words(key).map((word) => upperFirst(word)).join(' ');
}

export function isBlank(value: unknown): boolean {
  return isEmpty(value);
}
