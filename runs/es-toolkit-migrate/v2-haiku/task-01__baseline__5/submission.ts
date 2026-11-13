import { merge } from 'es-toolkit/object';
import { truncate, words } from 'es-toolkit/compat';
import { upperFirst } from 'es-toolkit/string';

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

export function preview(text: string): string {
  return truncate(text, { length: 24 });
}
