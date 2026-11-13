/**
 * migrate 과제를 함수 목록에서 규칙으로 조합해 생성한다.
 *
 * 과제 하나는 함수 세 개로 이루어진다: 동작이 같을 것으로 보는 함수(A), 동작이 다를 것으로 보는
 * 함수(C), compat에만 있거나 es-toolkit에 없는 함수(B·D). 조합은 손으로 고르지 않고 목록을
 * 순환하며 만든다. 층 표시는 작성자의 예상일 뿐이고, 실제 정답은 기준 해답 계산이 정한다.
 *
 * 사용: pnpm tsx scripts/build-tasks.ts
 * 출력: suites/es-toolkit/migrate/tasks/<id>/ (공개), sealed/es-toolkit/migrate/<id>.json (비공개)
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mulberry32 } from '../src/stats/paired.js';

interface Entry {
  readonly key: string;
  readonly fn: string;
  readonly exportName: string;
  /** 내보내는 함수의 코드. lodash 함수는 fn 이름 그대로 부른다. */
  readonly code: string;
  readonly range: string;
  /** 인자 이름. 입력 범위 설명에 쓴다. */
  readonly params: string;
  readonly variants: Readonly<Record<string, string>>;
}

const strict = (fn: string): string => `import { ${fn} } from 'es-toolkit';`;
const compat = (fn: string): string => `import { ${fn} } from 'es-toolkit/compat';`;
const both = (fn: string): Record<string, string> => ({ strict: strict(fn), compat: compat(fn) });

/** 속성 이름을 받는 lodash 호출을 strict 함수와 화살표 함수로 감싼 어댑터. */
const keyAdapter = (fn: string, returns: string, body: string): string =>
  `import { ${fn} as ${fn}With } from 'es-toolkit';\nconst ${fn} = <T, K extends keyof T>(items: readonly T[], key: K): ${returns} =>\n  ${fn}With(items, (item) => ${body});`;

const A: readonly Entry[] = [
  {
    key: 'merge',
    fn: 'merge',
    exportName: 'applyPatch',
    params: 'base, patch',
    range: 'configPair',
    variants: both('merge'),
    code: 'export function applyPatch(base: Config, patch: Config): Config {\n  return merge(base, patch);\n}',
  },
  {
    key: 'groupByFn',
    fn: 'groupBy',
    exportName: 'byName',
    params: 'rows',
    range: 'rows',
    variants: both('groupBy'),
    code: 'export function byName(rows: Row[]): Record<string, Row[]> {\n  return groupBy(rows, (row) => row.name);\n}',
  },
  {
    key: 'pick',
    fn: 'pick',
    exportName: 'publicFields',
    params: 'row',
    range: 'row',
    variants: both('pick'),
    code: "export function publicFields(row: Row): Pick<Row, 'id' | 'name'> {\n  return pick(row, ['id', 'name']);\n}",
  },
  {
    key: 'mapValues',
    fn: 'mapValues',
    exportName: 'doubled',
    params: 'scores',
    range: 'scores',
    variants: both('mapValues'),
    code: 'export function doubled(scores: Record<string, number>): Record<string, number> {\n  return mapValues(scores, (score) => score * 2);\n}',
  },
  {
    key: 'camelCase',
    fn: 'camelCase',
    exportName: 'toKey',
    params: 'label',
    range: 'label',
    variants: both('camelCase'),
    code: 'export function toKey(label: string): string {\n  return camelCase(label);\n}',
  },
  {
    key: 'words',
    fn: 'words',
    exportName: 'tokens',
    params: 'text',
    range: 'label',
    variants: both('words'),
    code: 'export function tokens(text: string): string[] {\n  return words(text);\n}',
  },
  {
    key: 'keyByFn',
    fn: 'keyBy',
    exportName: 'byId',
    params: 'rows',
    range: 'rows',
    variants: both('keyBy'),
    code: 'export function byId(rows: Row[]): Record<string, Row> {\n  return keyBy(rows, (row) => row.id);\n}',
  },
  {
    key: 'kebabCase',
    fn: 'kebabCase',
    exportName: 'toSlug',
    params: 'label',
    range: 'label',
    variants: both('kebabCase'),
    code: 'export function toSlug(label: string): string {\n  return kebabCase(label);\n}',
  },
];

const C: readonly Entry[] = [
  {
    key: 'startCase',
    fn: 'startCase',
    exportName: 'toTitle',
    params: 'key',
    range: 'label',
    variants: both('startCase'),
    code: 'export function toTitle(key: string): string {\n  return startCase(key);\n}',
  },
  {
    key: 'groupByKey',
    fn: 'groupBy',
    exportName: 'byAge',
    params: 'rows',
    range: 'rows',
    variants: {
      ...both('groupBy'),
      adapted: keyAdapter('groupBy', 'Record<string, T[]>', 'String(item[key])'),
    },
    code: "export function byAge(rows: Row[]): Record<string, Row[]> {\n  return groupBy(rows, 'age');\n}",
  },
  {
    key: 'sumByKey',
    fn: 'sumBy',
    exportName: 'totalAge',
    params: 'rows',
    range: 'rows',
    variants: { ...both('sumBy'), adapted: keyAdapter('sumBy', 'number', 'Number(item[key])') },
    code: "export function totalAge(rows: Row[]): number {\n  return sumBy(rows, 'age');\n}",
  },
  {
    key: 'keyByKey',
    fn: 'keyBy',
    exportName: 'byNameKey',
    params: 'rows',
    range: 'rows',
    variants: {
      ...both('keyBy'),
      adapted: keyAdapter('keyBy', 'Record<string, T>', 'String(item[key])'),
    },
    code: "export function byNameKey(rows: Row[]): Record<string, Row> {\n  return keyBy(rows, 'name');\n}",
  },
];

const BD: readonly Entry[] = [
  {
    key: 'truncate',
    fn: 'truncate',
    exportName: 'preview',
    params: 'text',
    range: 'asciiText',
    variants: { compat: compat('truncate') },
    code: 'export function preview(text: string): string {\n  return truncate(text, { length: 24 });\n}',
  },
  {
    key: 'isEmpty',
    fn: 'isEmpty',
    exportName: 'isBlank',
    params: 'value',
    range: 'jsonAny',
    variants: { compat: compat('isEmpty') },
    code: 'export function isBlank(value: unknown): boolean {\n  return isEmpty(value);\n}',
  },
  {
    key: 'toNumber',
    fn: 'toNumber',
    exportName: 'parseAmount',
    params: 'text',
    range: 'amountText',
    variants: { compat: compat('toNumber') },
    code: 'export function parseAmount(text: string): number {\n  return toNumber(text);\n}',
  },
  {
    key: 'fromPairs',
    fn: 'fromPairs',
    exportName: 'toLookup',
    params: 'pairs',
    range: 'pairs',
    variants: { compat: compat('fromPairs') },
    code: 'export function toLookup(pairs: [string, number][]): Record<string, number> {\n  return fromPairs(pairs);\n}',
  },
  {
    key: 'sortedUniq',
    fn: 'sortedUniq',
    exportName: 'dedupeSorted',
    params: 'values',
    range: 'sortedInts',
    variants: {},
    code: 'export function dedupeSorted(values: number[]): number[] {\n  return sortedUniq(values);\n}',
  },
];

/** 조합 규칙을 몇 번째까지 적용할지. 채택된 과제가 16개가 되도록 22번째까지 만든다. */
const TASK_COUNT = 22;
const HIDDEN_COUNT = 3000;
const HIDDEN_SEED = Number(process.env['SKILL_EVAL_HIDDEN_SEED'] ?? '20261113');
const EXAMPLE_SEED = 7;
const HEADER =
  'export interface Row {\n  id: number;\n  name: string;\n  age: number;\n}\n\nexport type Config = Record<string, unknown>;\n';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const publicRoot = join(repoRoot, 'suites/es-toolkit/migrate/tasks');
const sealedRoot = process.env['SKILL_EVAL_SEALED'] ?? join(repoRoot, 'sealed/es-toolkit/migrate');
const { ranges } = (await import(
  pathToFileURL(join(repoRoot, 'suites/es-toolkit/migrate/lib/gen.mjs')).href
)) as { ranges: Record<string, { describe: string; make: (random: () => number) => unknown[] }> };

function write(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content, 'utf8');
}

rmSync(publicRoot, { recursive: true, force: true });
rmSync(sealedRoot, { recursive: true, force: true });

for (let i = 0; i < TASK_COUNT; i++) {
  // 세 목록을 순환하며 조합한다. 길이가 8, 4, 5라 40번째까지는 같은 조합이 반복되지 않는다.
  const picked = [A[i % A.length], C[i % C.length], BD[i % BD.length]].filter(
    (entry): entry is Entry => entry !== undefined,
  );
  // 한 파일에서 같은 lodash 함수를 두 번 가져올 수 없다. 겹치면 그 조합은 건너뛴다.
  if (new Set(picked.map((entry) => entry.fn)).size !== picked.length) {
    console.log(
      `조합 ${i + 1}: lodash 함수가 겹쳐 건너뜀 (${picked.map((e) => e.key).join(', ')})`,
    );
    continue;
  }
  const id = `task-${String(i + 1).padStart(2, '0')}`;
  const imports = picked.map((entry) => `import ${entry.fn} from 'lodash/${entry.fn}';`);
  const source = `${imports.join('\n')}\n\n${HEADER}\n${picked.map((e) => e.code).join('\n\n')}\n`;
  const exampleRandom = mulberry32(EXAMPLE_SEED + i);

  write(join(publicRoot, id, 'src/module.ts'), source);
  write(
    join(publicRoot, id, 'task.json'),
    `${JSON.stringify(
      {
        id,
        file: 'src/module.ts',
        functions: picked.map((entry) => entry.key),
        inputRange: picked
          .map(
            (entry) =>
              `${entry.exportName}(${entry.params}): ${ranges[entry.range]?.describe ?? ''}.`,
          )
          .join(' '),
        exports: picked.map((entry) => ({
          name: entry.exportName,
          examples: [0, 1].map(() => ranges[entry.range]?.make(exampleRandom) ?? []),
        })),
      },
      null,
      2,
    )}\n`,
  );
  write(
    join(publicRoot, id, 'inputs.mjs'),
    `import { ranges } from '../../lib/gen.mjs';\n\nexport const generators = {\n${picked
      .map((entry) => `  ${entry.exportName}: ranges.${entry.range}.make,`)
      .join('\n')}\n};\n`,
  );
  write(
    join(sealedRoot, `${id}.json`),
    `${JSON.stringify(
      {
        slots: picked.map((entry, index) => ({
          name: entry.fn,
          original: imports[index],
          variants: entry.variants,
        })),
        hidden: {},
        generated: { seed: HIDDEN_SEED + i * 100, count: HIDDEN_COUNT },
      },
      null,
      2,
    )}\n`,
  );
  console.log(`${id}: ${picked.map((entry) => entry.key).join(', ')}`);
}
