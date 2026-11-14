import { merge, upperFirst, words } from 'es-toolkit';
import { truncate } from 'es-toolkit/compat';

export interface Row {
  id: number;
  name: string;
  age: number;
}

export type Config = Record<string, unknown>;

export function applyPatch(base: Config, patch: Config): Config {
  return merge(base, patch) as Config;
}

// lodash startCase keeps the case of letters after the first one, so split into
// words and uppercase only each word's first letter (es-toolkit's startCase lowercases the rest).
export function toTitle(key: string): string {
  return words(key).map(upperFirst).join(' ');
}

export function preview(text: string): string {
  return truncate(text, { length: 24 });
}
