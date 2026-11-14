import { ranges } from '../../lib/gen.mjs';

export const generators = {
  applyPatch: ranges.configPair.make,
  toTitle: ranges.label.make,
  toLookup: ranges.pairs.make,
};
