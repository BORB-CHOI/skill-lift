import { pick, sumBy } from 'es-toolkit';

export interface Row {
  id: number;
  name: string;
  age: number;
}

export type Config = Record<string, unknown>;

export function publicFields(row: Row): Pick<Row, 'id' | 'name'> {
  return pick(row, ['id', 'name']);
}

export function totalAge(rows: Row[]): number {
  return sumBy(rows, (row) => row.age);
}

// Object.fromEntries is a built-in with lodash fromPairs semantics (last duplicate key wins).
// es-toolkit's main entry has no fromPairs; only es-toolkit/compat does, which is larger.
export function toLookup(pairs: [string, number][]): Record<string, number> {
  return Object.fromEntries(pairs);
}
