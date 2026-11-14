import { ranges } from '../../lib/gen.mjs';

export const generators = {
  publicFields: ranges.row.make,
  totalAge: ranges.rows.make,
  preview: ranges.asciiText.make,
};
