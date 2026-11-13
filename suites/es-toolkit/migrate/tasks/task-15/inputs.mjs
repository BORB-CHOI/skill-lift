import { ranges } from '../../lib/gen.mjs';

export const generators = {
  byId: ranges.rows.make,
  totalAge: ranges.rows.make,
  dedupeSorted: ranges.sortedInts.make,
};
