import { describe, expect, it } from 'vitest';
import {
  classifyEsToolkitSpecifier,
  collectEsToolkitFunctions,
  collectLodashFunctions,
  declaresEsToolkit,
  findLodashDependencies,
  findLodashReferences,
  parseNumstat,
  summarizeEntryPoints,
} from '../../src/graders/project-scan.js';
import {
  judgeHidden,
  judgeProjectTests,
  matchesBaseline,
  parseManifest,
  parseVitestReport,
  relativeTo,
} from '../../src/graders/project-vitest.js';
import { appendArgs, withArgs } from '../../src/graders/project-workspace.js';
import { resolveCommand } from '../../src/graders/project.js';

describe('findLodashReferences', () => {
  it.each([
    [`import get from 'lodash/get';`],
    [`import { get } from "lodash";`],
    [`import _ from 'lodash-es';`],
    [`import debounce from 'lodash.debounce';`],
    [`import 'lodash';`],
    [`export { get } from 'lodash';`],
    [`const _ = require('lodash');`],
    ['const g = require(`lodash/get`);'],
    [`const m = await import('lodash/merge');`],
    [`_: import("lodash").LoDashStatic;`],
    [`/// <reference types="lodash" />`],
    [`import type { LoDashStatic } from 'lodash';`],
  ])('찾는다: %s', (code) => {
    expect(findLodashReferences('a.ts', code)).toHaveLength(1);
  });

  it.each([
    [`import { get } from 'es-toolkit/compat';`],
    [`// lodash.get 은 쓰지 않는다`],
    [`const lodashLike = require('./lodash-compat');`],
    [`import x from 'my-lodash';`],
    [`import x from 'lodashx';`],
    [`it.utils._.get(a, 'b')`],
  ])('찾지 않는다: %s', (code) => {
    expect(findLodashReferences('a.ts', code)).toHaveLength(0);
  });

  it('줄 번호와 파일을 기록한다', () => {
    const refs = findLodashReferences('src/x.ts', `a\nb\nimport get from 'lodash/get';\n`);
    expect(refs).toEqual([{ file: 'src/x.ts', line: 3, text: `from 'lodash/get'` }]);
  });

  it('따옴표 종류가 다르면 걸지 않는다', () => {
    expect(findLodashReferences('a.ts', `import x from 'lodash";`)).toHaveLength(0);
  });
});

describe('package.json 검사', () => {
  it('세 의존성 필드의 lodash 계열과 @types를 찾는다', () => {
    const pkg = {
      dependencies: { lodash: '^4', react: '18' },
      devDependencies: { '@types/lodash': '^4', 'lodash.debounce': '1', '@types/lodash-es': '1' },
      peerDependencies: { 'lodash-es': '4' },
      optionalDependencies: { lodash: '4' },
    };
    expect(findLodashDependencies(pkg).map((d) => `${d.field}:${d.name}`)).toEqual([
      'dependencies:lodash',
      'devDependencies:@types/lodash',
      'devDependencies:lodash.debounce',
      'devDependencies:@types/lodash-es',
      'peerDependencies:lodash-es',
    ]);
  });

  it('비슷한 이름은 lodash 계열이 아니다', () => {
    expect(
      findLodashDependencies({ dependencies: { 'lodash-compat-x': '1', mylodash: '1' } }),
    ).toEqual([]);
  });

  it('형식이 이상해도 예외 없이 빈 결과', () => {
    expect(findLodashDependencies(null)).toEqual([]);
    expect(findLodashDependencies({ dependencies: ['lodash'] })).toEqual([]);
  });

  it('es-toolkit은 dependencies에 있어야 한다', () => {
    expect(declaresEsToolkit({ dependencies: { 'es-toolkit': '^1.53.2' } })).toBe(true);
    expect(declaresEsToolkit({ devDependencies: { 'es-toolkit': '^1.53.2' } })).toBe(false);
    expect(declaresEsToolkit({ dependencies: { 'es-toolkit': '' } })).toBe(false);
    expect(declaresEsToolkit({})).toBe(false);
  });
});

describe('진입점 집계', () => {
  it('지정자를 strict·compat으로 나눈다', () => {
    expect(classifyEsToolkitSpecifier('es-toolkit')).toBe('strict');
    expect(classifyEsToolkitSpecifier('es-toolkit/array')).toBe('strict');
    expect(classifyEsToolkitSpecifier('es-toolkit/compat')).toBe('compat');
    expect(classifyEsToolkitSpecifier('es-toolkit/compat/get')).toBe('compat');
    expect(classifyEsToolkitSpecifier('lodash')).toBeNull();
  });

  it('lodash 함수 이름을 경로 import, 이름 있는 import, 멤버 접근에서 모은다', () => {
    const src = [
      `import get from 'lodash/get';`,
      `import { uniq as u } from 'lodash';`,
      `import lodash from "lodash";`,
      `import type { LoDashStatic } from 'lodash';`,
      `lodash.each(a, f); lodash .merge(a, b); foo.lodash.nope();`,
    ].join('\n');
    expect([...collectLodashFunctions(src)].sort()).toEqual(['each', 'get', 'merge', 'uniq']);
  });

  it('es-toolkit import를 함수별 진입점으로 모은다', () => {
    const src = [
      `import { compact, merge } from "es-toolkit";`,
      `import { camelCase, get as g } from "es-toolkit/compat";`,
      `import isEqual from 'es-toolkit/compat/isEqual';`,
      `import * as tk from 'es-toolkit/compat';`,
      `tk.sortBy(x);`,
    ].join('\n');
    const m = collectEsToolkitFunctions(src);
    expect([...m.keys()].sort()).toEqual([
      'camelCase',
      'compact',
      'get',
      'isEqual',
      'merge',
      'sortBy',
    ]);
    expect([...(m.get('get') ?? [])]).toEqual(['compat']);
    expect([...(m.get('merge') ?? [])]).toEqual(['strict']);
  });

  it('요약은 strict·compat·mixed·none', () => {
    const r = summarizeEntryPoints(
      new Set(['a', 'b', 'c', 'd']),
      new Map([
        ['a', new Set(['strict' as const])],
        ['b', new Set(['compat' as const])],
        ['c', new Set(['strict' as const, 'compat' as const])],
      ]),
    );
    expect(r).toEqual({ a: 'strict', b: 'compat', c: 'mixed', d: 'none' });
  });

  it('numstat을 합산한다(바이너리는 파일만)', () => {
    expect(parseNumstat('3\t1\tsrc/a.ts\n-\t-\timg.png\n10\t0\tb.ts\n')).toEqual({
      files: 3,
      added: 13,
      deleted: 1,
    });
  });
});

const ROOT = 'C:/tmp/work';
function report(files: unknown[]): unknown {
  return { numTotalTests: 0, testResults: files };
}
function assertion(ancestors: string[], title: string, status: string, failure = ''): unknown {
  return {
    ancestorTitles: ancestors,
    title,
    fullName: [...ancestors, title].join(' '),
    status,
    failureMessages: failure === '' ? [] : [failure],
  };
}

describe('vitest json 해석', () => {
  it('상대 경로는 구분자와 대소문자를 무시한다', () => {
    expect(relativeTo('C:\\tmp\\work', 'c:/tmp/work/test/a.spec.ts')).toBe('test/a.spec.ts');
    expect(relativeTo(ROOT, 'D:/other/a.ts')).toBe('D:/other/a.ts');
  });

  it('형식이 다르면 예외', () => {
    expect(() => parseVitestReport({}, ROOT)).toThrow();
  });

  it('테스트와 파일 오류를 나눈다', () => {
    const parsed = parseVitestReport(
      report([
        {
          name: `${ROOT}/test/a.spec.ts`,
          status: 'failed',
          message: '',
          assertionResults: [
            assertion(['A'], 'ok', 'passed'),
            assertion(['A', 'B'], 'bad', 'failed', 'boom'),
          ],
        },
        {
          name: `${ROOT}/test/b.spec.ts`,
          status: 'failed',
          message: 'SyntaxError',
          assertionResults: [],
        },
        {
          name: `${ROOT}/test/c.spec.ts`,
          status: 'passed',
          message: '',
          assertionResults: [assertion([], 's', 'skipped')],
        },
      ]),
      ROOT,
    );
    expect(parsed.tests).toHaveLength(3);
    expect(parsed.fileErrors).toEqual([{ file: 'test/b.spec.ts', message: 'SyntaxError' }]);
  });

  it('baseline 항목을 여러 표기로 맞춘다', () => {
    const t = {
      file: 'test/cartesian/XAxis.spec.tsx',
      ancestors: ['<XAxis />', 'time scale'],
      title: 'should render ticks',
      fullName: '<XAxis /> time scale should render ticks',
      status: 'failed' as const,
      failure: '',
    };
    // fixture 메타가 실제로 쓰는 표기: 파일 > fullName
    expect(
      matchesBaseline(
        t,
        'test/cartesian/XAxis.spec.tsx > <XAxis /> time scale should render ticks',
      ),
    ).toBe(true);
    expect(
      matchesBaseline(
        t,
        'test/cartesian/XAxis.spec.tsx > <XAxis /> > time scale > should render ticks',
      ),
    ).toBe(true);
    expect(matchesBaseline(t, '<XAxis /> time scale should render ticks')).toBe(true);
    expect(matchesBaseline(t, { file: 'XAxis.spec.tsx', name: 'should render ticks' })).toBe(true);
    expect(matchesBaseline(t, 'test/cartesian/XAxis.spec.tsx > other')).toBe(false);
    expect(matchesBaseline(t, { file: 'YAxis.spec.tsx', name: 'should render ticks' })).toBe(false);
  });

  it('기존 테스트 항목: baseline 실패는 빼고, 새 실패나 파일 오류가 있으면 실패', () => {
    const files = (extra: unknown[]): unknown =>
      report([
        {
          name: `${ROOT}/test/a.spec.ts`,
          status: 'failed',
          message: '',
          assertionResults: [
            assertion(['A'], 'known', 'failed', 'x'),
            assertion(['A'], 'ok', 'passed'),
          ],
        },
        ...extra,
      ]);
    const baseline = ['test/a.spec.ts > A known'];
    const ok = judgeProjectTests(parseVitestReport(files([]), ROOT), baseline);
    expect(ok.pass).toBe(true);
    expect(ok.excusedFailures).toEqual(['test/a.spec.ts > A > known']);

    const newFail = judgeProjectTests(
      parseVitestReport(
        files([
          {
            name: `${ROOT}/test/b.spec.ts`,
            status: 'failed',
            message: '',
            assertionResults: [assertion([], 'x', 'failed')],
          },
        ]),
        ROOT,
      ),
      baseline,
    );
    expect(newFail.pass).toBe(false);
    expect(newFail.unexpectedFailures).toEqual(['test/b.spec.ts > x']);

    const fileErr = judgeProjectTests(
      parseVitestReport(
        files([
          {
            name: `${ROOT}/test/c.spec.ts`,
            status: 'failed',
            message: 'Cannot find module',
            assertionResults: [],
          },
        ]),
        ROOT,
      ),
      baseline,
    );
    expect(fileErr.pass).toBe(false);
    expect(fileErr.fileErrors).toHaveLength(1);
  });

  it('제외한 테스트 때문에만 생긴 Obsolete snapshots 파일 오류는 제외한다', () => {
    // swagger-typescript-api: 네트워크가 막혀 실패한 테스트의 스냅숏이 CI 모드에서 obsolete로 잡힌다.
    const raw = (keys: string[]): unknown =>
      report([
        {
          name: `${ROOT}/tests/simple.test.ts`,
          status: 'failed',
          message: `Obsolete snapshots found when no snapshot update is expected.\n${keys.map((k) => `· ${k} 1`).join('\n')}`,
          assertionResults: [
            assertion(['simple'], "'full-swagger-scheme'", 'failed', 'ECONNREFUSED'),
            assertion(['simple'], "'petstore'", 'passed'),
          ],
        },
      ]);
    const baseline = ["tests/simple.test.ts > simple 'full-swagger-scheme'"];
    const ok = judgeProjectTests(
      parseVitestReport(raw(["simple > 'full-swagger-scheme'"]), ROOT),
      baseline,
    );
    expect(ok.pass).toBe(true);
    const other = judgeProjectTests(
      parseVitestReport(raw(["simple > 'full-swagger-scheme'", "simple > 'petstore'"]), ROOT),
      baseline,
    );
    expect(other.pass).toBe(false);
    // baseline에 없으면 테스트 실패와 파일 오류 모두 남는다.
    expect(
      judgeProjectTests(parseVitestReport(raw(["simple > 'full-swagger-scheme'"]), ROOT), []).pass,
    ).toBe(false);
  });

  it('테스트가 하나도 없으면 실패', () => {
    expect(judgeProjectTests(parseVitestReport(report([]), ROOT), []).pass).toBe(false);
  });
});

describe('숨김 검사', () => {
  it('manifest를 검증한다', () => {
    expect(parseManifest([{ id: 'a', file: 'x.spec.ts' }])).toHaveLength(1);
    expect(() => parseManifest({})).toThrow();
    expect(() => parseManifest([{ id: 'a' }])).toThrow();
    expect(() =>
      parseManifest([
        { id: 'a', file: 'x' },
        { id: 'a', file: 'y' },
      ]),
    ).toThrow();
  });

  it('id(또는 test 필드)와 같은 it을 찾아 판정한다', () => {
    const parsed = parseVitestReport(
      report([
        {
          name: `${ROOT}/test/__hidden__/p.spec.tsx`,
          status: 'failed',
          message: '',
          assertionResults: [
            assertion(['suite'], 'get: deep path', 'passed'),
            assertion(['suite'], 'max: empty', 'failed', 'expected undefined'),
          ],
        },
        {
          name: `${ROOT}/test/__hidden__/broken.spec.tsx`,
          status: 'failed',
          message: 'import failed',
          assertionResults: [],
        },
      ]),
      ROOT,
    );
    const checks = parseManifest([
      { id: 'get: deep path', file: 'p.spec.tsx' },
      { id: 'max', file: 'p.spec.tsx', test: 'max: empty' },
      { id: 'missing', file: 'p.spec.tsx' },
      { id: 'b', file: 'broken.spec.tsx' },
    ]);
    const r = judgeHidden(parsed, checks, 'test\\__hidden__\\');
    expect(r.map((x) => [x.id, x.pass])).toEqual([
      ['get: deep path', true],
      ['max', false],
      ['missing', false],
      ['b', false],
    ]);
    expect(r[1]?.detail).toContain('expected undefined');
    expect(r[3]?.detail).toContain('파일 오류');
  });
});

describe('명령 구성', () => {
  it('npm 스크립트에는 -- 뒤로 인자를 넘긴다', () => {
    expect(appendArgs('npm test', ['--reporter=json'])).toBe('npm test -- --reporter=json');
    expect(appendArgs('npm run t -- -x', ['a'])).toBe('npm run t -- -x a');
    expect(appendArgs('npx vitest run', ['--outputFile=C:/a b/x.json'])).toBe(
      'npx vitest run "--outputFile=C:/a b/x.json"',
    );
  });

  it('argv 명령은 인자를 그대로 붙인다', () => {
    const spec = { argv: ['node', 'v.mjs', 'run'], shell: false, env: {} };
    expect(withArgs(spec, ['x']).argv).toEqual(['node', 'v.mjs', 'run', 'x']);
  });

  it('grading.json 문자열 > 메타 argv > 메타 문자열 순서로 고른다', () => {
    expect(resolveCommand('yarn build', ['node', 'a'], false, 'b', {})).toEqual({
      argv: ['yarn build'],
      shell: true,
      env: {},
    });
    expect(resolveCommand(undefined, ['node', 'a'], false, 'CI=true b', { CI: 'true' })).toEqual({
      argv: ['node', 'a'],
      shell: false,
      env: { CI: 'true' },
    });
    expect(resolveCommand(undefined, [], false, 'npm run x', {})?.shell).toBe(true);
    expect(resolveCommand(undefined, undefined, false, undefined, {})).toBeNull();
  });
});
