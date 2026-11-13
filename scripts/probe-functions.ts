/**
 * 과제 후보 함수 조사: strict·compat 존재 여부, lodash와 동작이 갈리는 입력 수, 번들 크기.
 * 과제에 쓸 함수를 실측으로 고르기 위한 도구다.
 *
 * 사용: pnpm tsx scripts/probe-functions.ts
 */
import { createRequire } from 'node:module';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as compat from 'es-toolkit/compat';
import * as strict from 'es-toolkit';
import { compareBehaviour, type AnyFunction } from '../src/graders/behaviour.js';
import { measureBundleSize } from '../src/graders/size.js';

const require = createRequire(import.meta.url);
const lodash = require('lodash') as Record<string, unknown>;
const repoRoot = fileURLToPath(new URL('../', import.meta.url));

const words = [
  'fooBar',
  'foo-bar',
  'FOO_BAR',
  'foo2bar',
  'XMLHttpRequest',
  '  leading space',
  'déjà vu',
  'foo.bar.baz',
  '__FOO__BAR__',
  'a1B2c3',
  'HTMLElement2D',
  '',
  'already_snake',
  'Title Case Words',
  'userID',
  'iOS15Device',
  'ÀÉÎõü',
  'x',
  '12 monkeys',
  'snake_case_and-kebab',
];
const one = (xs: readonly unknown[]): unknown[][] => xs.map((x) => [x]);
const rows = [
  { name: 'b', age: 30, tags: ['x'] },
  { name: 'a', age: 30, tags: [] },
  { name: 'c', age: 25, tags: ['y', 'z'] },
  { name: 'a', age: 41, tags: ['x'] },
];

const cases: Record<string, unknown[][]> = {
  camelCase: one(words),
  kebabCase: one(words),
  snakeCase: one(words),
  startCase: one(words),
  upperFirst: one(words),
  capitalize: one(words),
  deburr: one(words),
  words: one(words),
  escape: one(['<a href="x">&</a>', "it's", 'plain', '`tick`']),
  truncate: [
    ['hello world foo bar', { length: 10 }],
    ['short', { length: 10 }],
    ['abcdefghij', { length: 5, omission: '..' }],
  ],
  pad: [
    ['abc', 8],
    ['abc', 8, '_-'],
    ['abc', 2],
  ],
  isEqual: [
    [{ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }],
    [new Date(1), new Date(1)],
    [
      [1, 2],
      [2, 1],
    ],
    [NaN, NaN],
    [0, -0],
    [{ a: undefined }, {}],
  ],
  cloneDeep: one([{ a: [1, { b: new Date(5) }] }, [[1], [2, [3]]], { n: null, u: undefined }]),
  merge: [
    [{ a: { b: 1, c: [1, 2] } }, { a: { d: 2, c: [9] } }],
    [{ a: 1 }, { a: undefined }],
    [{ a: [{ x: 1 }] }, { a: [{ y: 2 }, { z: 3 }] }],
  ],
  orderBy: [
    [rows, ['age', 'name'], ['desc', 'asc']],
    [rows, ['name'], ['desc']],
    [rows, 'age', 'asc'],
  ],
  sortBy: [
    [rows, ['age', 'name']],
    [rows, 'name'],
    [rows, [(r: { tags: string[] }) => r.tags.length]],
  ],
  groupBy: [
    [rows, 'age'],
    [rows, (r: { name: string }) => r.name],
  ],
  keyBy: [
    [rows, 'name'],
    [rows, (r: { age: number }) => r.age],
  ],
  pick: [
    [{ a: 1, b: { c: 2 }, d: 3 }, ['a', 'd']],
    [{ a: 1, b: { c: 2 } }, 'b.c'],
    [{ a: 1 }, ['zz']],
  ],
  omit: [
    [{ a: 1, b: { c: 2 }, d: 3 }, ['a', 'd']],
    [{ a: 1, b: { c: 2, e: 5 } }, 'b.c'],
  ],
  mapValues: [
    [{ a: { n: 1 }, b: { n: 2 } }, 'n'],
    [{ a: 1, b: 2 }, (v: number) => v * 2],
  ],
  mapKeys: [[{ a: 1, b: 2 }, (_v: number, k: string) => k.toUpperCase()]],
  difference: [
    [
      [1, 2, 3, 4],
      [2, 4],
    ],
    [[1, 2, 3], [2], [3]],
  ],
  intersection: [
    [
      [1, 2, 3],
      [2, 3, 4],
    ],
    [[1, 2, 3], [2, 3], [3]],
  ],
  zipObject: [
    [
      ['a', 'b'],
      [1, 2],
    ],
    [['a', 'b', 'c'], [1]],
  ],
  range: [[5], [1, 10, 3], [5, 0], [0]],
  sum: one([[1, 2, 3], [], [0.1, 0.2]]),
  sumBy: [
    [rows, 'age'],
    [rows, (r: { age: number }) => r.age],
  ],
  flattenDeep: one([[1, [2, [3, [4]]]], []]),
  isEmpty: one([{}, [], '', 0, null, new Map(), { a: 1 }, 'x', new Set([1])]),
  isPlainObject: one([{}, [], new Date(), Object.create(null), null, 'x']),
  toNumber: one(['12', ' 3.5 ', '0x1f', 'abc', null, '', true]),
  clamp: [
    [10, 0, 5],
    [-3, 0, 5],
    [3, 5],
  ],
  inRange: [
    [3, 5],
    [3, 2, 4],
    [4, 8, 2],
  ],
  partition: [
    [rows, (r: { age: number }) => r.age > 28],
    [rows, { age: 30 }],
  ],
  countBy: [
    [rows, 'age'],
    [rows, (r: { name: string }) => r.name],
  ],
  uniqWith: [[[{ a: 1 }, { a: 1 }, { a: 2 }], (x: { a: number }, y: { a: number }) => x.a === y.a]],
  sortedUniqBy: [[[1.1, 1.4, 2.2, 2.9], Math.floor]],
};

async function size(entry: string, fn: string, dir: string): Promise<number | null> {
  const file = join(dir, `${fn}-${entry.replace(/\W/g, '_')}.ts`);
  const code = entry.startsWith('lodash')
    ? `import f from 'lodash/${fn}';\nexport const g = f;\n`
    : `import { ${fn} as f } from '${entry}';\nexport const g = f;\n`;
  writeFileSync(file, code, 'utf8');
  try {
    return (await measureBundleSize(file, repoRoot)).gzipped;
  } catch {
    return null;
  }
}

const dir = join(repoRoot, '.grade-tmp', 'probe');
mkdirSync(dir, { recursive: true });
console.log(
  '함수'.padEnd(14),
  'strict'.padStart(7),
  'compat'.padStart(7),
  'lodash'.padStart(7),
  ' strict불일치',
  ' compat불일치',
  ' 입력수',
);
try {
  for (const [fn, inputs] of Object.entries(cases)) {
    const original = lodash[fn];
    if (typeof original !== 'function') continue;
    const s = (strict as Record<string, unknown>)[fn];
    const c = (compat as Record<string, unknown>)[fn];
    const mism = (target: unknown): string =>
      typeof target === 'function'
        ? String(
            compareBehaviour(original as AnyFunction, target as AnyFunction, inputs).mismatches
              .length,
          )
        : '없음';
    const ss = typeof s === 'function' ? await size('es-toolkit', fn, dir) : null;
    const cs = typeof c === 'function' ? await size('es-toolkit/compat', fn, dir) : null;
    const ls = await size('lodash', fn, dir);
    console.log(
      fn.padEnd(14),
      String(ss ?? '-').padStart(7),
      String(cs ?? '-').padStart(7),
      String(ls ?? '-').padStart(7),
      mism(s).padStart(12),
      mism(c).padStart(12),
      String(inputs.length).padStart(6),
    );
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
