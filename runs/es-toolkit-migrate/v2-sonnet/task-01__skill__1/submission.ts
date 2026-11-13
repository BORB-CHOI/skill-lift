import { merge } from 'es-toolkit';
import { startCase } from 'es-toolkit/compat';
import { truncate } from 'es-toolkit/compat';

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

export function preview(text: string): string {
  return truncate(text, { length: 24 });
}
