import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { copyArtifact, prepareWorkspace, verifyDeps } from '../../src/runner/workspace.js';

let root = '';
let deps = '';
let task = '';

function pkg(name: string, version: string): void {
  mkdirSync(join(deps, name), { recursive: true });
  writeFileSync(join(deps, name, 'package.json'), JSON.stringify({ name, version }), 'utf8');
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'workspace-test-'));
  deps = join(root, 'deps/node_modules');
  pkg('lodash', '4.18.1');
  pkg('@types/lodash', '4.17.27');
  pkg('es-toolkit', '1.53.2');
  pkg('typescript', '5.9.3');
  pkg('esbuild', '0.28.2');
  mkdirSync(join(deps, '.bin'));
  writeFileSync(join(deps, '.bin/tsc'), '', 'utf8');
  writeFileSync(join(deps, '.bin/esbuild'), '', 'utf8');
  task = join(root, 'task');
  mkdirSync(join(task, 'src'), { recursive: true });
  writeFileSync(join(task, 'src/module.ts'), "import chunk from 'lodash/chunk';\n", 'utf8');
  writeFileSync(join(task, 'task.json'), '{}', 'utf8');
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('verifyDeps', () => {
  it('정해진 버전을 확인하고 실제 버전을 돌려준다', () => {
    expect(verifyDeps(deps)).toEqual({
      lodash: '4.18.1',
      '@types/lodash': '4.17.27',
      'es-toolkit': '1.53.2',
      typescript: '5.9.3',
    });
  });

  it('lodash가 없거나 버전이 다르면 실패한다', () => {
    const other = join(root, 'other/node_modules');
    mkdirSync(join(other, 'es-toolkit'), { recursive: true });
    writeFileSync(join(other, 'es-toolkit/package.json'), '{"version":"1.53.2"}', 'utf8');
    expect(() => verifyDeps(other)).toThrow(/lodash/);
    mkdirSync(join(other, 'lodash'));
    writeFileSync(join(other, 'lodash/package.json'), '{"version":"4.17.21"}', 'utf8');
    expect(() => verifyDeps(other)).toThrow(/4\.18\.1/);
  });
});

describe('prepareWorkspace', () => {
  it('src와 네 패키지만 넣고 과제의 다른 파일과 esbuild는 넣지 않는다', () => {
    const ws = prepareWorkspace(task, deps, verifyDeps(deps));
    try {
      expect(existsSync(join(ws, 'src/module.ts'))).toBe(true);
      expect(existsSync(join(ws, 'task.json'))).toBe(false);
      for (const name of ['lodash', '@types/lodash', 'es-toolkit', 'typescript', '.bin/tsc']) {
        expect(existsSync(join(ws, 'node_modules', name))).toBe(true);
      }
      expect(existsSync(join(ws, 'node_modules/esbuild'))).toBe(false);
      expect(existsSync(join(ws, 'node_modules/.bin/esbuild'))).toBe(false);
      const manifest = JSON.parse(readFileSync(join(ws, 'package.json'), 'utf8')) as {
        dependencies: Record<string, string>;
      };
      expect(manifest.dependencies['lodash']).toBe('4.18.1');
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });
});

describe('copyArtifact', () => {
  it('있으면 복사하고 없으면 false다', () => {
    const ws = join(root, 'ws');
    mkdirSync(join(ws, 'out'), { recursive: true });
    writeFileSync(join(ws, 'out/module.ts'), 'x\r\n', 'utf8');
    const dest = join(root, 'run/submission.ts');
    expect(copyArtifact(ws, 'out/module.ts', dest)).toBe(true);
    expect(readFileSync(dest, 'utf8')).toBe('x\r\n');
    expect(copyArtifact(ws, 'out/migration-report.json', join(root, 'run/report.json'))).toBe(
      false,
    );
  });
});
