import { merge } from 'es-toolkit';
import isEmpty from 'es-toolkit/compat/isEmpty';
// es-toolkit's startCase splits digit-adjacent capitals differently from lodash
// (e.g. "0THb"), and its words() does too, so lodash's startCase is kept.
import startCase from 'lodash/startCase';

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
