// Hidden parity checks: the `_` object handed to templates
// (src/code-gen-process.ts getRenderTemplateData: `_: lodash`) and the
// helper utils exposed next to it. A custom extra template
// (hidden-fixtures/templates/lodash-surface.ejs) calls `_` exactly the way the
// bundled default templates do; see that file for the call-site mapping.
//
// Functions used by the bundled templates (templates/**/*.ejs):
//   isUndefined compact camelCase map replace get upperCase values lowerCase
//   join isObject uniq size isString isEmpty
// Expected values were captured from the ORIGINAL lodash implementation.
import * as path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { FIXTURES_DIR, gen, parseTemplateResults, readFixture } from './hidden-utils.js';

// generation is slow on a cold transform cache; the default 10s hook timeout
// would turn every check of the file into "skipped".
const HOOK_TIMEOUT_MS = 120_000;

describe('hidden: template `_` surface', () => {
  let r: Record<string, any>;

  beforeAll(async () => {
    const { files } = await gen(readFixture('routes.json'), {
      generateClient: true,
      extraTemplates: [
        {
          name: 'lodash-surface',
          path: path.join(FIXTURES_DIR, 'templates', 'lodash-surface.ejs'),
        },
      ],
    });
    r = parseTemplateResults(files['lodash-surface.ts']);
  }, HOOK_TIMEOUT_MS);

  it('code-gen-process.ts:getRenderTemplateData(_): every lodash function used by the default templates is still provided', () => {
    expect(r.fnTypes).toEqual([
      'isUndefined:function',
      'compact:function',
      'camelCase:function',
      'map:function',
      'replace:function',
      'get:function',
      'upperCase:function',
      'values:function',
      'lowerCase:function',
      'join:function',
      'isObject:function',
      'uniq:function',
      'size:function',
      'isString:function',
      'isEmpty:function',
    ]);
  });

  it('templates(_.camelCase/_.lowerCase/_.upperCase): route-name / route-docs casing on Springfox, ordinal and accented inputs', () => {
    expect(r.camelOperationIds).toEqual([
      'getUserUsingGet',
      'listUsingGet1',
      'list2ndFactorMethods',
      'rechnungsubersicht',
      'cremeBruleeList',
    ]);
    expect(r.lowerMethods).toEqual(['get', 'delete', 'patch']);
    expect(r.camelRoot).toBe('getRoot');
    expect(r.camelMethodModule).toBe('postUbersicht');
    expect(r.upperMethods).toEqual(['GET', 'PATCH', 'DELETE ALL', 'LIST 2ND']);
  });

  it('templates(_.compact/_.uniq/_.join/_.size/_.isEmpty/_.isUndefined/_.isObject/_.isString): falsy filtering, de-duplication, size/emptiness and type guards on edge values', () => {
    expect(r.compactJsDoc).toEqual(['@format int32', '@pattern ^[a-z]+$']);
    expect(r.uniqComments).toEqual(['Pet name', '@example Rex']);
    expect(r.joinNames).toBe('storeId, itemId');
    expect(r.sizes).toEqual([0, 0, 2, 2, 4]);
    // [42, 0, "", "x", [], {}, new Map(), Map(1), null, undefined]
    expect(r.isEmptyValues).toEqual([true, true, true, false, true, true, true, false, true, true]);
    expect(r.everyIsEmpty).toEqual([true, false]);
    // data-contract-jsdoc.ejs stringify of @default / @example values
    expect(r.isUndefinedValues).toEqual([true, false, false, false, false]);
    // [{}, [], fn, null, "s", 1, Date]
    expect(r.isObjectValues).toEqual([true, true, true, false, false, false, true]);
    expect(r.isStringValues).toEqual([true, true, false, false, false]);
    expect(r.stringifyDefaults).toEqual(['{"a":1}', '["x"]', '"text"', '5', 'null', 'false']);
  });

  it('templates(_.map/_.values/_.get/_.replace): property shorthand over objects, undefined inputs, string paths, regex replace', () => {
    expect(r.pathParamNames).toEqual(['storeId']);
    expect(r.mapShorthandObject).toEqual(['storeId', 'itemId']);
    expect(r.mapOfUndefined).toEqual([]);
    expect(r.valuesOfUndefined).toEqual([]);
    expect(r.valuesOfString).toEqual(['a', 'b']);
    expect(r.modelTypeNames).toEqual(['Item', 'Error']);
    expect(r.getValues).toEqual([null, 'data', 'a@b.c', 'MIT', 1, 7]);
    expect(r.replaceComment).toBe('Array<\\* legacy *\\ Item>');
    expect(r.replaceNewlines).toBe('line one\n * line two');
  });

  it('code-gen-process.ts:getRenderTemplateData(utils.internalCase/pascalCase/formatDescription): helpers exposed to templates', () => {
    // internalCase = camelCase(lowerCase(x)); pascalCase = upperFirst(camelCase(x))
    expect(r.internalCase).toEqual(['xmlHttpRequest', 'list2nd', 'arger', 'integer']);
    expect(r.pascalCase).toEqual(['List2ndFactor', 'Oauth2Token', 'CremeBrulee', '用户Controller']);
    expect(r.formatDescriptionInline).toBe('First line. Second line.');
    expect(r.title).toBe('Routes edge cases');
  });
});
