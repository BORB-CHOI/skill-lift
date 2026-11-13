import { mapValues, keyBy, zipObject } from 'es-toolkit';
export interface Row { id: number; name: string; age: number; }
export type Config = Record<string, unknown>;
export function doubled(scores: Record<string, number>): Record<string, number> {
  return mapValues(scores, (score) => score * 2);
}
export function byNameKey(rows: Row[]): Record<string, Row> {
  return keyBy(rows, (r) => r.name);
}
export function toLookup(pairs: [string, number][]): Record<string, number> {
  return zipObject(pairs.map((p) => p[0]), pairs.map((p) => p[1]));
}
