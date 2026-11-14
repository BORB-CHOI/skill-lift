import merge from 'es-toolkit/compat/merge';
import startCase from 'es-toolkit/compat/startCase';
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
  return startCase(key);
}

export function isBlank(value: unknown): boolean {
  return isEmpty(value);
}
