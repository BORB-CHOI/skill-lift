import { pick, sumBy } from 'es-toolkit';
// The main entry has no lodash-shaped truncate (only a different one); es-toolkit/compat's
// truncate preserves lodash's { length } option and '...' omission exactly.
import { truncate } from 'es-toolkit/compat';

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
  // sumBy in es-toolkit takes a function; the lodash 'age' shorthand is not supported.
  return sumBy(rows, (row) => row.age);
}

export function preview(text: string): string {
  return truncate(text, { length: 24 });
}
