/**
 * 과제 생성(설계 문서 4.1~4.3).
 *
 * 분류 결과(classification.json)에서 S·D·C 항목만 쓴다. exclusions.json에 적은 항목은 X로 보고 뺀다. lodash 함수 하나는 과제 하나에만 넣고,
 * 같은 함수의 사용 방식이 둘이면 S 항목을 쓴다(S가 없으면 목록에서 먼저 나온 것).
 * 고정 시드로 유형별 목록을 섞은 뒤 S·D·C를 하나씩 묶어 과제를 만든다. 남는 항목은 섞어서
 * 3개씩 묶고, 3개가 안 되면 버린다.
 *
 * 출력
 * - suites/es-toolkit/migrate/tasks/<id>/src/module.ts: 원본 lodash 모듈(에이전트에게 주는 파일)
 * - suites/es-toolkit/migrate/tasks/<id>/task.json: 항목 이름과 유형(채점용, 작업 폴더에 복사하지 않는다)
 * - <SKILL_EVAL_SEALED>/reference/<id>.ts: 기준 해답
 * - <SKILL_EVAL_SEALED>/seed: 숨김 입력 시드(이미 있으면 그대로 둔다)
 *
 * 사용: pnpm tsx scripts/build-tasks.ts
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mulberry32 } from '../src/stats/paired.js';
// @ts-expect-error 생성기 목록은 타입 선언이 없는 .mjs다.
import { catalog } from '../suites/es-toolkit/migrate/catalog.mjs';

interface Entry {
  fn: string;
  name: string;
  params: string;
  returns: string;
  body: string;
  doc: string;
}
interface Classified {
  fn: string;
  name: string;
  type: 'S' | 'D' | 'C' | 'X';
}
type ItemType = 'S' | 'D' | 'C';
interface Item extends Entry {
  type: ItemType;
}

const BUILD_SEED = 20261115;
const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const suiteDir = join(repoRoot, 'suites/es-toolkit/migrate');
const sealedDir = process.env.SKILL_EVAL_SEALED ?? join(repoRoot, 'sealed/es-toolkit/migrate-v3');

const classified = (
  JSON.parse(readFileSync(join(suiteDir, 'classification.json'), 'utf8')) as {
    results: Classified[];
  }
).results;
const typeOf = new Map(classified.map((c) => [c.name, c.type]));
// 채점기 관문에서 기준 해답이 실패해 X로 본 항목. 이름과 사유를 파일로 남긴다.
const excluded = JSON.parse(readFileSync(join(suiteDir, 'exclusions.json'), 'utf8')) as Record<
  string,
  string
>;
for (const name of Object.keys(excluded)) typeOf.set(name, 'X');

const byFn = new Map<string, Item>();
for (const entry of catalog as Entry[]) {
  const type = typeOf.get(entry.name);
  if (type === undefined || type === 'X') continue;
  const current = byFn.get(entry.fn);
  if (current === undefined || (current.type !== 'S' && type === 'S')) {
    byFn.set(entry.fn, { ...entry, type });
  }
}

function shuffle<T>(xs: T[], random: () => number): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = out[i] as T;
    out[i] = out[j] as T;
    out[j] = a;
  }
  return out;
}

/** 배열 끝 원소를 꺼낸다. 비어 있으면 생성 규칙이 깨진 것이므로 멈춘다. */
function take<T>(xs: T[]): T {
  const x = xs.pop();
  if (x === undefined) throw new Error('빈 목록에서 항목을 꺼내려 했다');
  return x;
}

const random = mulberry32(BUILD_SEED);
const pools: Record<ItemType, Item[]> = { S: [], D: [], C: [] };
for (const item of byFn.values()) pools[item.type].push(item);
for (const t of ['S', 'D', 'C'] as const) pools[t] = shuffle(pools[t], random);

const groups: Item[][] = [];
while (pools.S.length > 0 && pools.D.length > 0 && pools.C.length > 0) {
  groups.push([take(pools.S), take(pools.D), take(pools.C)]);
}
const rest = shuffle([...pools.S, ...pools.D, ...pools.C], random);
while (rest.length >= 3) groups.push(rest.splice(0, 3));

const TYPES = `export interface Row {
  id: number;
  name: string;
  age: number | null;
  score: number;
}

export type Config = Record<string, unknown>;
`;

function functionsSource(items: Item[]): string {
  return items
    .map(
      (i) =>
        `/** ${i.doc} */\nexport function ${i.name}(${i.params}): ${i.returns} {\n  ${i.body}\n}`,
    )
    .join('\n\n');
}

function moduleSource(items: Item[]): string {
  const imports = items.map((i) => `import ${i.fn} from 'lodash/${i.fn}';`).join('\n');
  return `${imports}\n\n${TYPES}\n${functionsSource(items)}\n`;
}

function referenceSource(items: Item[]): string {
  const imports = items
    .map((i) =>
      i.type === 'S'
        ? `import { ${i.fn} } from 'es-toolkit';`
        : `import { ${i.fn} } from 'es-toolkit/compat';`,
    )
    .join('\n');
  return `${imports}\n\n${TYPES}\n${functionsSource(items)}\n`;
}

const tasksDir = join(suiteDir, 'tasks');
rmSync(tasksDir, { recursive: true, force: true });
mkdirSync(join(sealedDir, 'reference'), { recursive: true });
if (!existsSync(join(sealedDir, 'seed'))) {
  writeFileSync(join(sealedDir, 'seed'), `${randomInt(1, 2 ** 31 - 1)}\n`, 'utf8');
}

groups.forEach((items, index) => {
  const id = `task-${String(index + 1).padStart(2, '0')}`;
  const dir = join(tasksDir, id);
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src/module.ts'), moduleSource(items), 'utf8');
  const task = {
    id,
    file: 'src/module.ts',
    items: items.map((i) => ({ fn: i.fn, name: i.name, type: i.type })),
  };
  writeFileSync(join(dir, 'task.json'), `${JSON.stringify(task, null, 2)}\n`, 'utf8');
  writeFileSync(join(sealedDir, 'reference', `${id}.ts`), referenceSource(items), 'utf8');
  console.log(id, items.map((i) => `${i.type}:${i.fn}`).join(' '));
});
console.log(`과제 ${groups.length}개, 항목 ${groups.length * 3}개`);
