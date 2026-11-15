// Hidden parity checks: configuration merging (src/configuration.ts,
// src/util/object-assign.ts, src/util/request.ts, src/code-gen-process.ts,
// src/swagger-schema-resolver.ts, src/schema-parser/schema-parser.ts).
//
// Expected values were captured from the ORIGINAL lodash implementation.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gen, loadGenerateApi, readFixture, squash } from './hidden-utils.js';

describe('hidden: configuration merge semantics', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('configuration.ts:constructor/objectAssign(primitiveTypeConstructs): function result is deep-merged into primitiveTypes', async () => {
    // Documented usage (types/index.ts `primitiveTypeConstructs?: (struct) => Partial<...>`):
    // remap only `string/date-time` to Date. lodash.merge keeps the sibling
    // string formats (`binary` -> File, `$default` -> string). A shallow
    // Object.assign drops them, and Object.assign(target, fn) ignores the function.
    const { main } = await gen(readFixture('schemas.json'), {
      primitiveTypeConstructs: () => ({ string: { 'date-time': 'Date' } }),
    });
    const code = squash(main);
    expect(code).toContain('/** @format date-time */ born?: Date;');
    expect(code).toContain('/** @format binary */ photo?: File;');
    expect(code).toContain('tagline?: string;');
    expect(code).toContain('/** @format uuid */ id: string;');
  });

  it('configuration.ts:constructor/objectAssign(codeGenConstructs): partial Keyword override keeps the other keywords', async () => {
    // Documented usage `codeGenConstructs: (struct) => Partial<CodeGenConstruct>`:
    // only `Keyword.Any` is replaced; Number/String/Boolean must survive the
    // deep merge (a shallow assign would replace the whole Keyword map).
    const { main } = await gen(readFixture('routes.json'), {
      generateClient: true,
      codeGenConstructs: () => ({ Keyword: { Any: 'unknown' } }),
    });
    const code = squash(main);
    expect(code).toContain(
      'this.request<void, unknown>({ path: `/stores/${storeId}/items/${itemId}`',
    );
    expect(code).toContain('export interface Item { id?: number; name?: string; }');
    expect(code).toContain('page_size?: number;');
  });

  it('configuration.ts:update/objectAssign(extractingOptions): partial extractingOptions keeps default suffix lists', async () => {
    // A user customising only the request-body suffix. lodash.merge merges the
    // nested object (and the array index-wise: ["Form", "Body", "Input"]), so
    // the default response-body / params suffixes stay intact.
    const { main, configuration } = await gen(readFixture('routes.json'), {
      generateClient: true,
      extractRequestBody: true,
      extractResponseBody: true,
      extractRequestParams: true,
      extractingOptions: { requestBodySuffix: ['Form'] },
    });
    expect(configuration.config.extractingOptions.requestBodySuffix).toEqual([
      'Form',
      'Body',
      'Input',
    ]);
    expect(configuration.config.extractingOptions.responseBodySuffix).toEqual([
      'Data',
      'Result',
      'Output',
    ]);
    const code = squash(main);
    expect(code).toContain('export interface CreateItemForm {');
    expect(code).toContain('export type CreateItemData = Item;');
    expect(code).toContain('export type ListItemsData = Item[];');
    expect(code).toContain('export interface ListItemsParams {');
  });

  it('configuration.ts:update/objectAssign(fileNames): partial fileNames keeps the other modular file names', async () => {
    // Modular output with only the data-contracts file renamed (a common
    // `fileNames: { dataContracts: "models" }` setup). Deep merge must keep
    // `httpClient: "http-client"`; a shallow assign yields `undefined.ts`.
    const { files } = await gen(readFixture('routes.json'), {
      modular: true,
      generateClient: true,
      fileNames: { dataContracts: 'models' },
    });
    expect(Object.keys(files).sort()).toEqual([
      'Health.ts',
      'Stores.ts',
      'http-client.ts',
      'models.ts',
    ]);
    expect(files['Stores.ts']).toContain('from "./http-client"');
    expect(files['Stores.ts']).toContain('from "./models"');
  });

  it('request.ts:download(lodash.merge): requestOptions headers are deep-merged with the Authorization header', async () => {
    // Fetching a remote spec with both `authorizationToken` and custom
    // `requestOptions.headers` (e.g. an API gateway key). lodash.merge deep
    // merges `headers`, so both headers reach fetch().
    const spec = readFixture('routes.json');
    const calls: { url: string; init: any }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: any) => {
      calls.push({ url, init: structuredClone(init) });
      return new Response(JSON.stringify(spec), { status: 200 });
    });
    const generateApi = await loadGenerateApi();
    const os = await import('node:os');
    const fs = await import('node:fs');
    const path = await import('node:path');
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'sta-hidden-'));
    try {
      await generateApi({
        url: 'https://specs.example.com/openapi.json',
        input: path.join(output, 'does-not-exist.json'),
        output,
        fileName: 'api.ts',
        silent: true,
        authorizationToken: 'Bearer abc',
        requestOptions: {
          headers: { 'X-Api-Key': 'k-123' },
          redirect: 'follow',
        },
      });
    } finally {
      fs.rmSync(output, { recursive: true, force: true });
    }
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://specs.example.com/openapi.json');
    expect(calls[0].init).toEqual({
      headers: { Authorization: 'Bearer abc', 'X-Api-Key': 'k-123' },
      redirect: 'follow',
    });
  });

  it('code-gen-process.ts:createApiConfig(lodash.merge externalDocs / compact tags): defaults filled, missing values tolerated', async () => {
    // routes.json declares externalDocs without a description; schemas.json
    // declares neither externalDocs nor tags (both are optional in OpenAPI).
    const captured: any[] = [];
    const hooks = {
      onPrepareConfig: (cfg: any) => {
        captured.push(structuredClone(cfg.apiConfig));
        return cfg;
      },
    };
    await gen(readFixture('routes.json'), { hooks });
    await gen(readFixture('schemas.json'), { hooks });
    expect(captured[0].externalDocs).toEqual({
      url: 'https://docs.example.com/api',
      description: '',
    });
    expect(captured[0].tags).toEqual([{ name: 'stores', description: 'Store operations' }]);
    expect(captured[1].externalDocs).toEqual({ url: '', description: '' });
    expect(captured[1].tags).toEqual([]);
  });

  it('schema-parser.ts:parseSchema(lodash.merge onPreParseSchema): hook result is deep-merged into the schema', async () => {
    // onPreParseSchema returning a nested partial patch for one property.
    // lodash.merge keeps `id.type` and the sibling `name` property; a shallow
    // assign replaces `properties` wholesale.
    const { main } = await gen(readFixture('routes.json'), {
      hooks: {
        onPreParseSchema: (schema: any, typeName: string) =>
          typeName === 'Item'
            ? {
                properties: {
                  id: { description: 'Item identifier', format: 'int64' },
                },
                required: ['id'],
              }
            : undefined,
      },
    });
    expect(squash(main)).toContain(
      'export interface Item { /** * Item identifier * @format int64 */ id: number; name?: string; }',
    );
  });
});
