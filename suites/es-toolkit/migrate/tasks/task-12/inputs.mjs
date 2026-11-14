import { ranges } from '../../lib/gen.mjs';

export const generators = {
  doubled: ranges.scores.make,
  byNameKey: ranges.rows.make,
  isBlank: ranges.jsonAny.make,
};
