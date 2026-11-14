// Shared helpers for the hidden lodash -> es-toolkit behaviour-parity checks.
//
// These files are copied into the project's `tests/` folder at grading time.
// The project root is located by walking up from this file until the
// swagger-typescript-api package.json is found, so the specs work whether they
// are copied to `tests/` or to a sub-folder such as `tests/__hidden__/`.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { vi } from 'vitest';

// Each check runs the real generator (TS compiler + Biome formatter); on a cold
// transform cache or a loaded machine a single file can exceed vitest's 10s
// hook default, which would silently turn its checks into "skipped".
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

export const HIDDEN_DIR = import.meta.dirname;
export const FIXTURES_DIR = path.join(HIDDEN_DIR, 'hidden-fixtures');

function findProjectRoot(): string {
  let dir = HIDDEN_DIR;
  for (;;) {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.name === 'swagger-typescript-api') return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error('swagger-typescript-api project root not found');
    }
    dir = parent;
  }
}

export const PROJECT_ROOT = findProjectRoot();

type GenerateApi = (config: Record<string, unknown>) => Promise<{
  files: { fileName: string; fileExtension: string; fileContent: string }[];
  configuration: Record<string, any>;
}>;

let generateApiPromise: Promise<GenerateApi> | undefined;

export function loadGenerateApi(): Promise<GenerateApi> {
  generateApiPromise ??= import(
    pathToFileURL(path.join(PROJECT_ROOT, 'src', 'index.ts')).href
  ).then((mod) => mod.generateApi as GenerateApi);
  return generateApiPromise;
}

export function readFixture(name: string): Record<string, any> {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf8'));
}

export interface GenResult {
  /** generated files keyed by `${fileName}${fileExtension}` */
  files: Record<string, string>;
  /** content of the single-file output (`api.ts`) when not modular */
  main: string;
  configuration: Record<string, any>;
}

/**
 * Runs the real generator on an in-memory spec. Output goes to a throw-away
 * temp dir; contents are taken from the returned `files` list.
 */
export async function gen(
  spec: Record<string, any>,
  options: Record<string, unknown> = {},
): Promise<GenResult> {
  const generateApi = await loadGenerateApi();
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'sta-hidden-'));
  try {
    const result = await generateApi({
      spec: structuredClone(spec),
      output,
      fileName: 'api.ts',
      silent: true,
      ...options,
    });
    const files: Record<string, string> = {};
    for (const file of result.files) {
      files[`${file.fileName}${file.fileExtension}`] = file.fileContent;
    }
    return { files, main: files['api.ts'] ?? '', configuration: result.configuration };
  } finally {
    fs.rmSync(output, { recursive: true, force: true });
  }
}

/** Collapses whitespace so assertions do not depend on formatter line wrapping. */
export function squash(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Decodes the `export const RESULTS = "<base64 json>";` line emitted by lodash-surface.ejs. */
export function parseTemplateResults(code: string): Record<string, any> {
  const match = code.match(/RESULTS\s*=\s*["']([A-Za-z0-9+/=]+)["']/);
  if (!match) throw new Error(`RESULTS literal not found in:\n${code}`);
  return JSON.parse(Buffer.from(match[1], 'base64').toString('utf8'));
}

/** Names of all exported interfaces / types / enums in generated code, in order. */
export function exportedNames(code: string): string[] {
  return [...code.matchAll(/export (?:interface|type|enum) ([^\s<={]+)/g)].map((m) => m[1]);
}
