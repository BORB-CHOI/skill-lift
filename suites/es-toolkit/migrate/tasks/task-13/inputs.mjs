import { ranges } from '../../lib/gen.mjs';

export const generators = {
  toKey: ranges.label.make,
  toTitle: ranges.label.make,
  parseAmount: ranges.amountText.make,
};
