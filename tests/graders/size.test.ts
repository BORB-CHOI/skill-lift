import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { measureBundleSize, withinSizeBudget } from '../../src/graders/size.js';

// 의존성(es-toolkit, lodash)을 이 리포지토리의 node_modules에서 찾게 한다.
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
let dir = '';

function entry(name: string, code: string): string {
  const file = join(dir, name);
  writeFileSync(file, code, 'utf8');
  return file;
}

beforeAll(() => {
  // node_modules를 찾을 수 있도록 리포지토리 안에 임시 폴더를 만든다.
  dir = mkdtempSync(join(repoRoot, '.size-test-'));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('measureBundleSize', () => {
  it('같은 파일은 같은 크기로 측정된다', async () => {
    const file = entry('a.ts', `import { chunk } from 'es-toolkit';\nexport const f = chunk;\n`);
    const first = await measureBundleSize(file, repoRoot);
    const second = await measureBundleSize(file, repoRoot);
    expect(second).toEqual(first);
    expect(first.gzipped).toBeGreaterThan(0);
    expect(first.gzipped).toBeLessThan(first.minified + 64);
  });

  it('strict, compat, lodash 순으로 커진다', async () => {
    const strict = await measureBundleSize(
      entry('s.ts', `import { sortBy } from 'es-toolkit';\nexport const f = sortBy;\n`),
      repoRoot,
    );
    const compat = await measureBundleSize(
      entry('c.ts', `import { sortBy } from 'es-toolkit/compat';\nexport const f = sortBy;\n`),
      repoRoot,
    );
    const lodash = await measureBundleSize(
      entry('l.ts', `import sortBy from 'lodash/sortBy';\nexport const f = sortBy;\n`),
      repoRoot,
    );
    expect(strict.gzipped).toBeLessThan(compat.gzipped);
    expect(compat.gzipped).toBeLessThan(lodash.gzipped);
    // 허용 오차 5%로 strict와 compat이 구분된다.
    expect(withinSizeBudget(compat.gzipped, strict.gzipped, 0.05)).toBe(false);
  });

  it('쓰지 않는 import는 크기에 들어가지 않는다', async () => {
    const used = await measureBundleSize(
      entry('u.ts', `import { chunk } from 'es-toolkit';\nexport const f = chunk;\n`),
      repoRoot,
    );
    const unused = await measureBundleSize(
      entry(
        'n.ts',
        `import { chunk, sortBy } from 'es-toolkit';\nexport const f = chunk;\nvoid 0 as unknown as typeof sortBy;\n`,
      ),
      repoRoot,
    );
    expect(unused.gzipped).toBe(used.gzipped);
  });
});

describe('withinSizeBudget', () => {
  it('기준의 (1 + ε)배까지 통과한다', () => {
    expect(withinSizeBudget(105, 100, 0.05)).toBe(true);
    expect(withinSizeBudget(106, 100, 0.05)).toBe(false);
    expect(withinSizeBudget(100, 100, 0)).toBe(true);
  });

  it('잘못된 기준과 허용 오차는 거부한다', () => {
    expect(() => withinSizeBudget(1, 0, 0.05)).toThrow(RangeError);
    expect(() => withinSizeBudget(1, 1, -0.1)).toThrow(RangeError);
  });
});
