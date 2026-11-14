import { ranges } from '../../lib/gen.mjs';

export const generators = {
  byId: ranges.rows.make,
  totalAge: ranges.rows.make,
  isBlank: ranges.jsonAny.make,
};
