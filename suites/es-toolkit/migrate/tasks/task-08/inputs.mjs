import { ranges } from '../../lib/gen.mjs';

export const generators = {
  toSlug: ranges.label.make,
  byNameKey: ranges.rows.make,
  parseAmount: ranges.amountText.make,
};
