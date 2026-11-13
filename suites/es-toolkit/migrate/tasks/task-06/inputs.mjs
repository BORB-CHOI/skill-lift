import { ranges } from '../../lib/gen.mjs';

export const generators = {
  tokens: ranges.label.make,
  byAge: ranges.rows.make,
  preview: ranges.asciiText.make,
};
