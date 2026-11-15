// Hidden end-to-end parity checks: whole generated output compared with
// golden files captured from the ORIGINAL lodash implementation
// (hidden-fixtures/golden/*). Each scenario drives many lodash call sites at
// once (casing, merging, enum/discriminator parsing, route grouping, the
// template `_` object), so any behavioural drift shows up as a diff.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIXTURES_DIR, gen, readFixture } from './hidden-utils.js';

export const E2E_SCENARIOS: Record<string, { fixture: string; options: Record<string, unknown> }> =
  {
    // Springfox/acronym/accented/CJK/ordinal names, tag-based modules, enums.
    naming: {
      fixture: 'naming.json',
      options: {
        generateClient: true,
        generateRouteTypes: true,
        moduleNameFirstTag: true,
        extractEnums: true,
        sortTypes: true,
      },
    },
    // allOf / discriminator / nullable / enum handling with every extract flag.
    schemas: {
      fixture: 'schemas.json',
      options: {
        generateClient: true,
        generateResponses: true,
        extractRequestBody: true,
        extractResponseBody: true,
        extractResponseError: true,
        extractRequestParams: true,
        extractEnums: true,
      },
    },
    // modular output (one file per module) with responses and route types.
    routesModular: {
      fixture: 'routes.json',
      options: {
        modular: true,
        generateClient: true,
        generateRouteTypes: true,
        generateResponses: true,
        extractResponses: true,
        extractRequestParams: true,
        sortRoutes: true,
      },
    },
  };

const GOLDEN_DIR = path.join(FIXTURES_DIR, 'golden');

const normalize = (text: string) => text.replace(/\r\n/g, '\n');

export async function renderScenario(name: string): Promise<string> {
  const scenario = E2E_SCENARIOS[name];
  const { files } = await gen(readFixture(scenario.fixture), scenario.options);
  return Object.keys(files)
    .sort()
    .map((file) => `//// ${file}\n${normalize(files[file])}`)
    .join('\n');
}

describe('hidden: end-to-end golden output', () => {
  it('code-gen-process.ts:generateApi(e2e naming.json): full output equals lodash-era golden', async () => {
    const golden = normalize(fs.readFileSync(path.join(GOLDEN_DIR, 'naming.txt'), 'utf8'));
    expect(await renderScenario('naming')).toBe(golden);
  });

  it('code-gen-process.ts:generateApi(e2e schemas.json): full output equals lodash-era golden', async () => {
    const golden = normalize(fs.readFileSync(path.join(GOLDEN_DIR, 'schemas.txt'), 'utf8'));
    expect(await renderScenario('schemas')).toBe(golden);
  });

  it('code-gen-process.ts:generateApi(e2e routes.json modular): full multi-file output equals lodash-era golden', async () => {
    const golden = normalize(fs.readFileSync(path.join(GOLDEN_DIR, 'routesModular.txt'), 'utf8'));
    expect(await renderScenario('routesModular')).toBe(golden);
  });
});
