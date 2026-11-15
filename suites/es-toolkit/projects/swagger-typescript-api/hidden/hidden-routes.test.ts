// Hidden parity checks: routes (src/schema-routes/schema-routes.ts,
// src/swagger-schema-resolver.ts, src/schema-parser/schema-formatters.ts).
// Expected values were captured from the ORIGINAL lodash implementation.
import { beforeAll, describe, expect, it } from 'vitest';
import { gen, readFixture, squash } from './hidden-utils.js';

// generation is slow on a cold transform cache; the default 10s hook timeout
// would turn every check of the file into "skipped".
const HOOK_TIMEOUT_MS = 120_000;

describe('hidden: routes', () => {
  let code: string;

  beforeAll(async () => {
    // routes.json: path-level parameters shared by GET/POST, vendor `x-*`
    // keys on the path item, a `$ref`'d 404 response, a 204 without content,
    // multipart upload, text/plain response, multi-line response description.
    code = squash(
      (
        await gen(readFixture('routes.json'), {
          generateClient: true,
          extractResponses: true,
        })
      ).main,
    );
  }, HOOK_TIMEOUT_MS);

  it('schema-routes.ts:createRequestsMap(lodash.reduce/concat/compact/get): path-level parameters merged into every method, x-* keys skipped', () => {
    expect(code).toContain(
      'listItems: ( storeId: string, query?: { page_size?: number; sort_by?: "name" | "price"; }, params: RequestParams = {}, ) =>',
    );
    expect(code).toContain('createItem: ( storeId: string, data: {');
    // `x-internal` / `x-codegen-ignore` on the path item are not routes
    expect(code).not.toMatch(/xInternal|xCodegenIgnore|codegenIgnore/i);
  });

  it('schema-routes.ts:getContentTypes(lodash.flatten/map/keys/uniq/compact): content kinds for multipart, text/plain, 204 and $ref responses', () => {
    expect(code).toContain(
      'this.request<Item, Error>({ path: `/stores/${storeId}/items`, method: "POST", body: data, type: ContentType.FormData, format: "json", ...params, })',
    );
    expect(code).toContain(
      'this.request<string, any>({ path: `/health`, method: "GET", ...params, })',
    );
    expect(code).toContain(
      'this.request<void, any>({ path: `/stores/${storeId}/items/${itemId}`, method: "DELETE", ...params, })',
    );
    expect(code).toContain('this.request<Item[], Error>({');
    expect(code).toContain('/** Not found */ export type NotFound = Error;');
  });

  it('swagger-schema-resolver.ts:fixSwaggerSchema(lodash.each/get/uniq/compact): Swagger 2 consumes merged and path params restored', async () => {
    // Swagger 2 with global `consumes: [json]` and an operation-level
    // duplicated `consumes: [urlencoded, urlencoded]` plus a path-level param.
    const legacy = squash((await gen(readFixture('swagger2.json'), { generateClient: true })).main);
    expect(legacy).toContain(
      'updateOrder: ( orderId: string, data: { note?: string; qty?: number; }, params: RequestParams = {}, ) => this.request<Order, any>({ path: `/orders/${orderId}`, method: "PUT", body: data, type: ContentType.UrlEncoded, format: "json", ...params, })',
    );
    expect(legacy).toContain(
      'getOrder: (orderId: string, params: RequestParams = {}) => this.request<Order, any>({',
    );
    expect(legacy).toContain('@baseUrl https://legacy.example.com/v1');
  });

  it('schema-formatters.ts:formatDescription(lodash chain compact, inline) + route-docs.ejs(_.replace): @response lines', async () => {
    const withResponses = squash(
      (
        await gen(readFixture('routes.json'), {
          generateClient: true,
          generateResponses: true,
        })
      ).main,
    );
    // "Items of the store.\n\nPaginated." -> blank line dropped by compact
    expect(withResponses).toContain(
      '* @response `200` `(Item)[]` Items of the store. Paginated. * @response `404` `Error`',
    );
    expect(withResponses).toContain(
      '* @response `201` `Item` created * @response `default` `Error` error',
    );
    expect(withResponses).toContain('* @response `204` `void` deleted');
  });

  it("schema-routes.ts:getRouteName(lodash.camelCase(lodash.compact(route.split('/'))[moduleNameIndex])) + getGroupedRoutes(lodash.reduce/each): module grouping by path index", async () => {
    // moduleNameIndex 1: "/stores/{store_id}/items" -> "{store_id}" -> "storeId";
    // "/health" has no segment 1 -> camelCase(undefined) "" -> out-of-module route.
    const grouped = squash(
      (
        await gen(readFixture('routes.json'), {
          generateClient: true,
          moduleNameIndex: 1,
          sortRoutes: true,
        })
      ).main,
    );
    expect(grouped).toContain(
      'health = (params: RequestParams = {}) => this.request<string, any>({',
    );
    expect(grouped).toMatch(/storeId = \{ .*createItem: .*deleteItem: .*listItems: /);
  });
});
