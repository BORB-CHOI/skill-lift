// Hidden parity checks: identifier casing (src/type-name-formatter.ts,
// src/util/pascal-case.ts, src/schema-routes/schema-routes.ts and the
// `_.camelCase` / `_.lowerCase` calls in templates/base/route-name.ejs).
//
// lodash's word splitter keeps acronyms ("API Error"), keeps ordinals as one
// word ("2nd"), splits CJK from Latin ("用户 Controller") and deburrs accents
// ("ü" -> "u"). es-toolkit's strict case functions differ on acronyms and
// accents; es-toolkit/compat differs on ordinals and CJK+Latin boundaries.
// Expected values were captured from the ORIGINAL lodash implementation.
import { beforeAll, describe, expect, it } from 'vitest';
import { exportedNames, gen, readFixture, squash } from './hidden-utils.js';

// generation is slow on a cold transform cache; the default 10s hook timeout
// would turn every check of the file into "skipped".
const HOOK_TIMEOUT_MS = 120_000;

describe('hidden: naming / casing', () => {
  let byTag: string;
  let extracted: string;

  beforeAll(async () => {
    // naming.json: model / tag / operationId names taken from real-world
    // specs: Springfox operationIds (`getUserUsingGET`, `listUsingGET_1`),
    // acronym model names (APIError, OAuth2Token), German tags with umlauts,
    // a Chinese Springfox model name, ordinal enum values (placements).
    byTag = squash(
      (
        await gen(readFixture('naming.json'), {
          generateClient: true,
          moduleNameFirstTag: true,
        })
      ).main,
    );
    extracted = squash(
      (
        await gen(readFixture('naming.json'), {
          generateClient: true,
          extractEnums: true,
        })
      ).main,
    );
  }, HOOK_TIMEOUT_MS);

  it('type-name-formatter.ts:format/fixModelName(lodash.startCase): acronym, kebab-case and accented model names', () => {
    // startCase("_APIError_") -> "API Error" in lodash; strict es-toolkit gives "Api Error".
    expect(byTag).toContain('export interface APIError {');
    expect(byTag).toContain('export interface OAuth2Token {');
    expect(byTag).toContain('export interface XMLDocument {');
    expect(byTag).toContain('export interface HTTPStatusInfo {');
    expect(byTag).toContain('this.request<APIError, any>');
    // `api-error-detail` goes through fixModelName's startCase branch;
    // `Rechnungsübersicht` is deburred by lodash's startCase ("u" not "ü").
    expect(byTag).toContain('export interface ApiErrorDetail {');
    expect(byTag).toContain('export interface Rechnungsubersicht {');
  });

  it('type-name-formatter.ts:format(lodash.startCase): CJK model names split from the Latin suffix', () => {
    // Springfox specs from Chinese projects use model names such as
    // `用户Controller`; lodash splits "用户" from "Controller" and keeps the
    // capital C. es-toolkit/compat lower-cases it ("Type用户controller").
    expect(byTag).toContain('export interface Type用户Controller {');
  });

  it('type-name-formatter.ts:format(lodash.startCase enum-key): ordinal enum values keep 1st/2nd/3rd/4th intact', () => {
    // Placement enum ["1st","2nd","3rd","4th"] (podium / ranking APIs): keys
    // are built with startCase("Value 1st") -> "Value1st" in lodash, while
    // es-toolkit/compat splits "1st" into "1 St" -> "Value1St".
    expect(byTag).toContain(
      'export enum Placement { Value1st = "1st", Value2nd = "2nd", Value3rd = "3rd", Value4th = "4th", }',
    );
  });

  it('enum.ts:parse(lodash.size/lodash.get x-enumNames): x-enumNames with ordinals map to the enum values by index', () => {
    // x-enumNames (NSwag style) supplies the keys; values come from
    // lodash.get(schema.enum, index). Keys then go through startCase.
    expect(byTag).toContain(
      'export enum ReviewRound { Review1st = 1, Review2nd = 2, ReviewFinal = 3, }',
    );
  });

  it('schema-routes.ts:getRouteName/moduleName(lodash.camelCase firstTag): tags with umlauts/accents become deburred module names', () => {
    // moduleNameFirstTag with German / French tags. lodash.camelCase deburrs:
    // "Rechnungsübersicht" -> "rechnungsubersicht", "Café" -> "cafe".
    expect(byTag).toContain('rechnungsubersicht = {');
    expect(byTag).toContain('cafe = {');
    expect(byTag).not.toContain('rechnungsübersicht = {');
  });

  it('route-name.ejs:_.camelCase(operationId)/createCustomOperationId: Springfox, ordinal and accented route names', () => {
    // Springfox generates `getUserUsingGET` / `listUsingGET_1`; a 2FA API uses
    // `list_2nd_factor_methods`. lodash keeps "2nd" as one word.
    expect(byTag).toContain('getUserUsingGet: (');
    expect(byTag).toContain('listUsingGet1: (params: RequestParams = {})');
    expect(byTag).toContain('list2ndFactorMethods: (params: RequestParams = {})');
    // GET /reports/{report_id}/crème-brûlée has no operationId: the template
    // strips `{...}` with _.replace, splits with _.compact and camelCases the
    // remainder plus "_list" -> deburred "cremeBruleeList"; `{report_id}` -> reportId.
    expect(byTag).toContain('cremeBruleeList: (reportId: number, params: RequestParams = {})');
    expect(byTag).toContain('path: `/reports/${reportId}/crème-brûlée`');
  });

  it('util/pascal-case.ts:pascalCase(lodash.upperFirst+camelCase): @name JSDoc of ordinal / Springfox routes', () => {
    // route-docs.ejs prints `@name ${pascalCase(routeName.usage)}`.
    expect(byTag).toContain('@name List2ndFactorMethods');
    expect(byTag).toContain('@name ListUsingGet1');
    expect(byTag).toContain('@name GetUserUsingGet');
    expect(byTag).toContain('@name CremeBruleeList');
  });

  it('schema-utils.ts:buildTypeNameFromPath(lodash.uniq/compact/camelCase): extracted inline enum names', () => {
    // extractEnums turns inline `APIError.level` / `Rechnungsübersicht.status`
    // enums into named enums; the name comes from
    // pascalCase(camelCase(uniq([typeName, propName]).join("_"))) + "Enum".
    // lodash yields "ApiErrorLevelEnum" and deburrs the German model name.
    const contracts = extracted.slice(0, extracted.indexOf('export type QueryParamsType'));
    // only the names produced by buildTypeNameFromPath (the component names
    // themselves are covered by the type-name-formatter checks above)
    expect(exportedNames(contracts).filter((name) => name.endsWith('Enum'))).toEqual([
      'ApiErrorLevelEnum',
      'RechnungsubersichtStatusEnum',
    ]);
    expect(extracted).toContain(
      'export enum ApiErrorLevelEnum { Warning = "warning", Fatal = "fatal", }',
    );
    expect(extracted).toContain('level?: ApiErrorLevelEnum;');
    expect(extracted).toContain('status?: RechnungsubersichtStatusEnum;');
  });
});
