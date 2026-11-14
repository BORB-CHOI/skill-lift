import { ranges } from '../../lib/gen.mjs';

export const generators = {
  applyPatch: ranges.configPair.make,
  toTitle: ranges.label.make,
  isBlank: ranges.jsonAny.make,
};
