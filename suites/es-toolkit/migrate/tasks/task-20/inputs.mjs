import { ranges } from '../../lib/gen.mjs';

export const generators = {
  doubled: ranges.scores.make,
  byNameKey: ranges.rows.make,
  dedupeSorted: ranges.sortedInts.make,
};
