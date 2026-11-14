import { merge, upperFirst } from 'es-toolkit';
import words from 'es-toolkit/compat/words';
import truncate from 'es-toolkit/compat/truncate';

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

export function preview(text: string): string {
  return truncate(text, { length: 24 });
}
