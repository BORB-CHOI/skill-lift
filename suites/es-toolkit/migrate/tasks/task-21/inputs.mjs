import { ranges } from '../../lib/gen.mjs';

export const generators = {
  toKey: ranges.label.make,
  toTitle: ranges.label.make,
  preview: ranges.asciiText.make,
};
