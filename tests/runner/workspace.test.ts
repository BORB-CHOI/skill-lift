import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BASE_TAG,
  nodeModulesFingerprint,
  prepareProjectWorkspace,
  removeTree,
  saveChanges,
} from '../../src/runner/workspace.js';

let root = '';
let fixture = '';

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
}

function write(base: string, rel: string, text: string): void {
  const file = join(base, rel);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, text, 'utf8');
}

/** prepare-fixtures.ts와 같은 모양의 작은 고정 사본: 기준 커밋, base 태그, node_modules 제외. */
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'workspace-test-'));
  fixture = join(root, 'fixture');
  write(fixture, 'package.json', '{"dependencies":{"lodash":"^4.17.21"}}\n');
  write(fixture, 'src/a.ts', "import { chunk } from 'lodash';\r\n");
  write(fixture, 'node_modules/lodash/package.json', '{"version":"4.17.21"}');
  write(fixture, 'node_modules/es-toolkit/package.json', '{"version":"1.53.2"}');
  write(fixture, 'node_modules/@types/lodash/package.json', '{}');
  git(fixture, 'init', '--quiet');
  git(fixture, 'config', 'core.autocrlf', 'false');
  git(fixture, 'config', 'user.name', 'eval');
  git(fixture, 'config', 'user.email', 'eval@localhost');
  writeFileSync(join(fixture, '.git/info/exclude'), 'node_modules/\n', 'utf8');
  git(fixture, 'add', '-A');
  git(fixture, 'commit', '--quiet', '-m', 'base');
  git(fixture, 'tag', BASE_TAG);
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('prepareProjectWorkspace', () => {
  it('node_modules와 .git까지 새 폴더로 복사한다', () => {
    const ws = prepareProjectWorkspace(fixture, join(root, 'ws'));
    try {
      expect(ws.dir.startsWith(join(root, 'ws'))).toBe(true);
      expect(ws.copyMs).toBeGreaterThanOrEqual(0);
      for (const rel of ['src/a.ts', '.git/HEAD', 'node_modules/es-toolkit/package.json']) {
        expect(existsSync(join(ws.dir, rel))).toBe(true);
      }
      expect(readFileSync(join(ws.dir, 'src/a.ts'), 'utf8')).toBe(
        "import { chunk } from 'lodash';\r\n",
      );
    } finally {
      removeTree(ws.dir);
    }
    expect(existsSync(ws.dir)).toBe(false);
  });

  it('node_modules가 없는 폴더는 거부한다', () => {
    const bare = join(root, 'bare');
    mkdirSync(join(bare, '.git'), { recursive: true });
    expect(() => prepareProjectWorkspace(bare, join(root, 'ws'))).toThrow(/node_modules/);
  });
});

describe('saveChanges', () => {
  it('수정·새 파일·삭제를 base 대비 패치로 저장하고 node_modules는 넣지 않는다', () => {
    const ws = prepareProjectWorkspace(fixture, join(root, 'ws'));
    try {
      write(ws.dir, 'src/a.ts', "import { chunk } from 'es-toolkit';\r\n");
      write(ws.dir, 'src/new.ts', 'export {};\n');
      write(ws.dir, 'node_modules/es-toolkit/extra.js', 'x');
      rmSync(join(ws.dir, 'package.json'));
      const patchFile = join(root, 'changes.patch');
      const saved = saveChanges(ws.dir, patchFile);
      const patch = readFileSync(patchFile, 'utf8');
      expect(saved.patchBytes).toBe(Buffer.byteLength(patch));
      expect(saved.changedFiles).toEqual(['D\tpackage.json', 'M\tsrc/a.ts', 'A\tsrc/new.ts']);
      expect(patch).toContain("+import { chunk } from 'es-toolkit';\r");
      expect(patch).not.toContain('node_modules');

      // 패치를 새 사본에 적용하면 같은 상태가 된다(채점기가 하는 일).
      const fresh = prepareProjectWorkspace(fixture, join(root, 'ws'));
      try {
        git(fresh.dir, 'apply', '--binary', patchFile);
        expect(readFileSync(join(fresh.dir, 'src/a.ts'), 'utf8')).toBe(
          "import { chunk } from 'es-toolkit';\r\n",
        );
        expect(existsSync(join(fresh.dir, 'src/new.ts'))).toBe(true);
      } finally {
        removeTree(fresh.dir);
      }
    } finally {
      removeTree(ws.dir);
    }
  });

  it('변경이 없으면 빈 패치다', () => {
    const ws = prepareProjectWorkspace(fixture, join(root, 'ws'));
    try {
      const saved = saveChanges(ws.dir, join(root, 'empty.patch'));
      expect(saved).toEqual({ patchBytes: 0, changedFiles: [] });
    } finally {
      removeTree(ws.dir);
    }
  });
});

describe('nodeModulesFingerprint', () => {
  it('패키지를 지우거나 es-toolkit 버전을 바꾸면 달라진다', () => {
    const ws = prepareProjectWorkspace(fixture, join(root, 'ws'));
    try {
      const before = nodeModulesFingerprint(ws.dir);
      expect(nodeModulesFingerprint(ws.dir)).toBe(before);
      write(ws.dir, 'src/b.ts', 'x');
      expect(nodeModulesFingerprint(ws.dir)).toBe(before);
      rmSync(join(ws.dir, 'node_modules/@types/lodash'), { recursive: true });
      const afterRemove = nodeModulesFingerprint(ws.dir);
      expect(afterRemove).not.toBe(before);
      write(ws.dir, 'node_modules/es-toolkit/package.json', '{"version":"1.0.0"}');
      expect(nodeModulesFingerprint(ws.dir)).not.toBe(afterRemove);
    } finally {
      removeTree(ws.dir);
    }
  });
});
