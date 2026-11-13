import { keyBy } from 'es-toolkit';
import { sumBy } from 'es-toolkit';
import { isEmpty } from 'es-toolkit/compat';
export interface Row { id: number; name: string; age: number; }
export type Config = Record<string, unknown>;
export function byId(rows: Row[]): Record<string, Row> { return keyBy(rows, (row) => row.id); }
export function totalAge(rows: Row[]): number { return sumBy(rows, (r) => r.age); }
export function isBlank(value: unknown): boolean { return isEmpty(value); }
