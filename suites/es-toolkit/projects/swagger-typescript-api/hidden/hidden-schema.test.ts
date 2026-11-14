// Hidden parity checks: schema parsing (src/schema-parser/**, src/configuration.ts Ts helpers).
// Expected values were captured from the ORIGINAL lodash implementation.
import { beforeAll, describe, expect, it } from 'vitest';
import { gen, readFixture, squash } from './hidden-utils.js';

// generation is slow on a cold transform cache; the default 10s hook timeout
// would turn every check of the file into "skipped".
const HOOK_TIMEOUT_MS = 120_000;

describe('hidden: schema parsing', () => {
  let code: string;

  beforeAll(async () => {
    // schemas.json (OpenAPI 3.1): allOf-with-description properties, allOf
    // with sibling properties, discriminators with and without mapping, an
    // empty enum, a 3.1 `type: [..., "null"]`, duplicate oneOf members and
    // allOf members inheriting the parent's `required`.
    code = squash((await gen(readFixture('schemas.json'))).main);
  }, HOOK_TIMEOUT_MS);

  it("object.ts:getObjectSchemaContent(lodash.map(allOf, 'description')/lodash.get rawTypeData): property descriptions from allOf members and referenced schemas", () => {
    // OAS 3.0 idiom for documenting a $ref: `allOf: [{$ref}, {description}]`.
    // lodash.compact(lodash.map(property.allOf, "description"))[0].
    expect(code).toContain('/** Current owner of the pet */ owner: User;');
    // plain $ref property: description from the referenced schema (rawTypeData)
    expect(code).toContain('/** A registered user of the shop */ previousOwner?: User;');
  });

  it('complex.ts:parse(lodash.omit/clone/keys/compact/map): allOf plus sibling properties becomes an intersection with the description of an allOf member', () => {
    // Dog = allOf[$ref Pet, {description}] + own `properties`. The complex
    // keys are omitted from a clone to build the sibling object part.
    expect(code).toContain(
      '/** A dog is a pet that barks */ export type Dog = Pet & { bark?: boolean; };',
    );
  });

  it('discriminator.ts:createMappingContent(lodash.entries mapping, lodash.reduce enum keys, lodash.get): mapping with an enum-typed discriminator property, with and without union enums', async () => {
    expect(code).toContain(
      'export type Shape = BaseShape & ( | BaseShapeKindMapping<ShapeKind.Circle, Circle> | BaseShapeKindMapping<ShapeKind.Square, Square> );',
    );
    expect(code).toContain('interface BaseShape { kind: ShapeKind; }');
    expect(code).toContain('type BaseShapeKindMapping<Key, Type> = { kind: Key; } & Type;');
    // discriminator without `mapping` (lodash.entries(undefined) -> [])
    expect(code).toContain('export type Event = (Click | Scroll) & { type: string; };');
    // generateUnionEnums: lodash.reduce over the enum builds literal mapping keys
    const union = squash(
      (await gen(readFixture('schemas.json'), { generateUnionEnums: true })).main,
    );
    expect(union).toContain('export type ShapeKind = "circle" | "square";');
    expect(union).toContain(
      'export type Shape = BaseShape & ( | BaseShapeKindMapping<"circle", Circle> | BaseShapeKindMapping<"square", Square> );',
    );
  });

  it('schema-utils.ts:getInternalSchemaType(lodash.isEmpty enum): an empty enum array is not treated as an enum', () => {
    // Some generators emit `enum: []` for a deprecated field; lodash.isEmpty([])
    // is true so the schema stays a primitive string (a truthiness check would
    // route it to the enum parser).
    expect(code).toContain('legacyStatus?: string;');
  });

  it('schema-utils.ts:getSchemaPrimitiveType(internalCase type) / isNullMissingInType(lodash.get x-nullable): nullable types', async () => {
    // OAS 3.1 `type: ["string","null"]` and Swagger 2 `x-nullable: true`.
    expect(code).toContain('nickname?: string | null;');
    const legacy = squash((await gen(readFixture('swagger2.json'))).main);
    expect(legacy).toContain(
      'export interface Order { id?: string; coupon?: string | null; total?: number; }',
    );
  });

  it('schema-utils.ts:makeAddRequiredToChildSchema(lodash.uniq/keys): parent `required` propagates into allOf members', () => {
    expect(code).toContain(
      'export type Address = { street: string; zip?: string; } & { city: string; };',
    );
  });

  it('configuration.ts:Ts.UnionType(lodash.join(lodash.uniq)): duplicate oneOf members are de-duplicated', () => {
    // oneOf [string, integer, string, number] -> "string | number" (integer
    // and number both map to `number`).
    expect(code).toContain('export type IdOrCode = string | number;');
  });
});
