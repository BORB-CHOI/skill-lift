import { ranges } from '../../lib/gen.mjs';

export const generators = {
  toSlug: ranges.label.make,
  byNameKey: ranges.rows.make,
  preview: ranges.asciiText.make,
};
