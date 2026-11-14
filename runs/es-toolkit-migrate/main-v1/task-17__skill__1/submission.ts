import { merge } from 'es-toolkit/object';
import startCase from 'es-toolkit/compat/startCase';
import isEmpty from 'es-toolkit/compat/isEmpty';

export interface Row {
  id: number;
  name: string;
  age: number;
}

export type Config = Record<string, unknown>;

// startCase and isEmpty come from es-toolkit/compat because the strict
// variants differ from lodash (strict startCase lowercases word tails; strict
// has no isEmpty equivalent). merge is the strict version, which matches lodash here.
export function applyPatch(base: Config, patch: Config): Config {
  return merge(base, patch);
}

export function toTitle(key: string): string {
  return startCase(key);
}

export function isBlank(value: unknown): boolean {
  return isEmpty(value);
}
