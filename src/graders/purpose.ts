/**
 * 목적 기반 채점기(설계 문서 6.1, 6.2, 6.3).
 *
 * 실행 하나의 제출물(첫 턴의 out/module.ts)과 보고서(두 번째 턴의 out/migration-report.json)를 받아
 * 항목마다 목적 1(P1)과 목적 2(P2) 점수를 매긴다.
 * - P1: 타입 검사 ∧ 숨김 입력에서 원본과 같은 동작 ∧ 유형에 맞는 진입점
 * - P2: strictSameAsLodash 정답 ∧ (false이고 strict 함수가 있으면) 범위 안의 유효한 반례
 *
 * 숨김 입력은 봉인 시드에서 항목마다 따로 만든다. 항목 시드는 이름의 FNV-1a 해시를 더해 정하므로
 * task.json의 항목 순서와 무관하다.
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as strict from 'es-toolkit';
import { mulberry32 } from '../stats/paired.js';
import { type AnyFunction, compareBehaviour } from './behaviour.js';
import { parseLiteral } from './literal.js';
import { loadModuleFromSource, type ModuleExports } from './load.js';
import { detectEntries, type EntryKind, isEntryOk, type ItemType } from './purpose-entry.js';
import { measureBundleSize } from './size.js';
import { typeCheck } from './typecheck.js';

export { parseLiteral } from './literal.js';
export { classifySpecifier, detectEntries, isEntryOk } from './purpose-entry.js';
export type { EntryKind, ImportKind, ItemType } from './purpose-entry.js';

/** catalog.mjs 항목 형식. */
export interface CatalogEntry {
  readonly fn: string;
  readonly name: string;
  readonly params: string;
  readonly returns: string;
  readonly body: string;
  readonly doc: string;
  readonly make: (random: () => number) => unknown[];
  readonly check: (args: unknown[]) => boolean;
}

export interface TaskItem {
  readonly fn: string;
  readonly name: string;
  readonly type: ItemType;
}

export interface PurposeTask {
  readonly id: string;
  readonly file: string;
  readonly items: readonly TaskItem[];
}

export interface P1Result {
  readonly typecheck: boolean;
  readonly behaviour: boolean;
  readonly entry: EntryKind;
  readonly entryOk: boolean;
  readonly score: 0 | 1;
}

export interface P2Result {
  /** 보고서에 그 lodash 함수 줄이 있는가. */
  readonly present: boolean;
  /** strictSameAsLodash 값. 줄이 없거나 불리언이 아니면 null. */
  readonly claimed: boolean | null;
  /** 반례를 검사한 경우의 결과. 검사하지 않았으면 null. */
  readonly counterexampleValid: boolean | null;
  readonly score: 0 | 1;
}

export interface ItemGrade {
  readonly name: string;
  readonly fn: string;
  readonly type: ItemType;
  readonly p1: P1Result;
  readonly p2: P2Result;
  /** S 항목에 유효한 반례가 나와 D로 재분류해야 하는가(6.2). */
  readonly reclassify: boolean;
}

export interface RunGrade {
  readonly items: readonly ItemGrade[];
  /** P1 항목 점수 평균. */
  readonly p1: number;
  /** P2 항목 점수 평균. */
  readonly p2: number;
  /** 타입 검사 ∧ 동작 보존만 본 점수의 평균(6.3). */
  readonly behaviourOnly: number;
  /** 제출물의 esbuild min+gzip 바이트. 타입 검사 실패나 번들 실패면 null. */
  readonly bundleBytes: number | null;
}

export interface GradeRunOptions {
  /** task.json과 src/module.ts가 있는 과제 폴더. */
  readonly taskDir: string;
  /** 첫 턴 끝의 out/module.ts 사본. 없으면 P1은 모두 0이다. */
  readonly submissionFile: string;
  /** 두 번째 턴의 보고서 사본. 없거나 깨졌으면 P2는 모두 0이다. */
  readonly reportFile: string;
  /** 봉인 시드. 생략하면 SKILL_EVAL_SEALED에서 읽는다. */
  readonly seed?: number;
  /** 항목당 숨김 입력 수. */
  readonly count?: number;
  /** node_modules를 찾을 폴더. 기본값은 저장소 루트. */
  readonly resolveDir?: string;
  /** 항목 정의. 기본값은 suites/es-toolkit/migrate/catalog.mjs. */
  readonly catalog?: readonly CatalogEntry[];
}

export const DEFAULT_COUNT = 3000;
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CATALOG_URL = new URL('../../suites/es-toolkit/migrate/catalog.mjs', import.meta.url);
const require = createRequire(import.meta.url);
const lodash = require('lodash') as Record<string, unknown>;
const strictEntry = strict as Record<string, unknown>;

export async function loadCatalog(): Promise<readonly CatalogEntry[]> {
  const mod = (await import(CATALOG_URL.href)) as { catalog: CatalogEntry[] };
  return mod.catalog;
}

/** SKILL_EVAL_SEALED 폴더의 seed 파일에서 정수 시드를 읽는다. */
export function readSealedSeed(env: NodeJS.ProcessEnv = process.env): number {
  const dir = env.SKILL_EVAL_SEALED;
  if (dir === undefined || dir === '') throw new Error('SKILL_EVAL_SEALED가 설정되지 않았다');
  const text = readFileSync(join(dir, 'seed'), 'utf8').trim();
  if (!/^-?\d+$/.test(text)) throw new Error(`봉인 시드가 정수가 아니다: ${text}`);
  return Number(text);
}

/** 32비트 FNV-1a 해시. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** 항목별 시드: (봉인 시드 + FNV-1a(항목 이름)) mod 2^32. */
export function itemSeed(seed: number, name: string): number {
  return (seed + fnv1a(name)) >>> 0;
}

export function hiddenInputs(entry: CatalogEntry, seed: number, count: number): unknown[][] {
  const random = mulberry32(itemSeed(seed, entry.name));
  return Array.from({ length: count }, () => entry.make(random));
}

/** `a: T, b: U` 형태의 TypeScript 매개변수 선언에서 이름만 뽑는다(scripts/classify-functions.ts와 같다). */
export function paramNames(params: string): string[] {
  let depth = 0;
  const parts: string[] = [];
  let current = '';
  for (const ch of params) {
    if ('<([{'.includes(ch)) depth++;
    if ('>)]}'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts.map((p) => (p.split(':')[0] ?? '').trim());
}

/** catalog 본문의 fn 호출을 impl로 바꾼 export 함수. */
export function buildWrapper(entry: CatalogEntry, impl: unknown): AnyFunction {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const make = new Function(
    entry.fn,
    `return function(${paramNames(entry.params).join(', ')}) { ${entry.body} };`,
  ) as (fn: unknown) => AnyFunction;
  return make(impl);
}

function readTask(taskDir: string): PurposeTask {
  const task = JSON.parse(readFileSync(join(taskDir, 'task.json'), 'utf8')) as PurposeTask;
  if (!Array.isArray(task.items)) throw new Error(`task.json에 items가 없다: ${taskDir}`);
  return task;
}

function findEntry(catalog: readonly CatalogEntry[], item: TaskItem): CatalogEntry {
  const entry = catalog.find((e) => e.name === item.name);
  if (entry === undefined) throw new Error(`catalog에 항목이 없다: ${item.name}`);
  if (entry.fn !== item.fn) {
    throw new Error(`항목 ${item.name}의 fn이 catalog와 다르다: ${item.fn} ≠ ${entry.fn}`);
  }
  return entry;
}

function readText(file: string): string | null {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

interface ReportLine {
  readonly lodash?: unknown;
  readonly strictSameAsLodash?: unknown;
  readonly counterexample?: unknown;
}

/** 보고서의 functions 배열. 파일이 없거나 형식이 틀리면 null. */
export function readReport(file: string): readonly ReportLine[] | null {
  const text = readText(file);
  if (text === null) return null;
  try {
    const parsed = JSON.parse(text) as { functions?: unknown } | null;
    if (typeof parsed !== 'object' || parsed === null || !Array.isArray(parsed.functions)) {
      return null;
    }
    return (parsed.functions as unknown[]).filter(
      (line): line is ReportLine => typeof line === 'object' && line !== null,
    );
  } catch {
    return null;
  }
}

/**
 * 보고서의 counterexample을 인자 배열로 바꾼다. JavaScript 배열 리터럴 문자열(NaN, -0, undefined,
 * 빈 칸 표현용)과 JSON 배열을 모두 받는다. 배열이 아니거나 해석할 수 없으면 null.
 */
export function counterexampleArgs(counterexample: unknown): unknown[] | null {
  if (typeof counterexample === 'string') {
    const parsed = parseLiteral(counterexample);
    return parsed.ok && Array.isArray(parsed.value) ? (parsed.value as unknown[]) : null;
  }
  return Array.isArray(counterexample) ? (counterexample as unknown[]) : null;
}

/**
 * 반례가 범위 검사기를 통과하고, 그 입력에서 lodash 판과 strict 판의 결과가 다른가.
 * 비교는 compareBehaviour로 예외, 반환값, 인자 변형까지 본다.
 */
export function isValidCounterexample(entry: CatalogEntry, counterexample: unknown): boolean {
  const args = counterexampleArgs(counterexample);
  if (args === null) return false;
  try {
    if (!entry.check(args)) return false;
  } catch {
    return false;
  }
  const original = buildWrapper(entry, lodash[entry.fn]);
  const migrated = buildWrapper(entry, strictEntry[entry.fn]);
  return !compareBehaviour(original, migrated, [args]).passed;
}

/** 보고서 한 줄로 항목 하나의 P2를 채점한다. */
export function gradeReportItem(
  item: TaskItem,
  entry: CatalogEntry,
  report: readonly ReportLine[] | null,
): { p2: P2Result; reclassify: boolean } {
  const line = report?.find((l) => l.lodash === item.fn);
  if (line === undefined) {
    return {
      p2: { present: false, claimed: null, counterexampleValid: null, score: 0 },
      reclassify: false,
    };
  }
  const claimed = typeof line.strictSameAsLodash === 'boolean' ? line.strictSameAsLodash : null;
  const base = { present: true, claimed };
  if (claimed === null)
    return { p2: { ...base, counterexampleValid: null, score: 0 }, reclassify: false };
  if (claimed) {
    return {
      p2: { ...base, counterexampleValid: null, score: item.type === 'S' ? 1 : 0 },
      reclassify: false,
    };
  }
  // false 주장. strict에 함수가 없으면(C) 반례는 보지 않는다.
  if (typeof strictEntry[item.fn] !== 'function') {
    return {
      p2: { ...base, counterexampleValid: null, score: item.type === 'S' ? 0 : 1 },
      reclassify: false,
    };
  }
  const valid = isValidCounterexample(entry, line.counterexample);
  // S 항목이라도 유효한 반례를 내면 정답으로 인정하고 D로 재분류한다(6.2).
  return {
    p2: { ...base, counterexampleValid: valid, score: valid ? 1 : 0 },
    reclassify: item.type === 'S' && valid,
  };
}

async function loadSubmission(code: string, resolveDir: string): Promise<ModuleExports | null> {
  try {
    return await loadModuleFromSource(code, resolveDir);
  } catch {
    return null;
  }
}

function behaves(
  entry: CatalogEntry,
  original: ModuleExports,
  submission: ModuleExports | null,
  inputs: readonly (readonly unknown[])[],
): boolean {
  const expected = original[entry.name];
  if (typeof expected !== 'function') {
    throw new Error(`원본 모듈에 ${entry.name} 함수가 없다`);
  }
  const actual = submission?.[entry.name];
  if (typeof actual !== 'function') return false;
  return compareBehaviour(expected as AnyFunction, actual as AnyFunction, inputs).passed;
}

async function bundleBytesOf(code: string, resolveDir: string): Promise<number | null> {
  const dir = join(resolveDir, '.grade-tmp', `purpose-size-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  try {
    const file = join(dir, 'entry.ts');
    writeFileSync(file, code, 'utf8');
    return (await measureBundleSize(file, resolveDir)).gzipped;
  } catch {
    return null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;

export async function gradeRun(options: GradeRunOptions): Promise<RunGrade> {
  const resolveDir = options.resolveDir ?? REPO_ROOT;
  const count = options.count ?? DEFAULT_COUNT;
  const seed = options.seed ?? readSealedSeed();
  const catalog = options.catalog ?? (await loadCatalog());
  const task = readTask(options.taskDir);
  const originalCode = readFileSync(join(options.taskDir, task.file), 'utf8');

  let original: ModuleExports;
  try {
    original = await loadModuleFromSource(originalCode, resolveDir);
  } catch (error) {
    // 원본이 실행되지 않으면 과제 결함이다. 채점 결과로 숨기지 않는다.
    throw new Error(`과제 ${task.id}의 원본을 불러오지 못했다`, { cause: error });
  }

  const code = readText(options.submissionFile);
  const typecheck = code !== null && typeCheck(code, originalCode, resolveDir).passed;
  const submission = code === null ? null : await loadSubmission(code, resolveDir);
  const entries = detectEntries(
    code ?? '',
    task.items.map((i) => i.name),
  );
  const report = readReport(options.reportFile);

  const items: ItemGrade[] = task.items.map((item) => {
    const entry = findEntry(catalog, item);
    const behaviour = behaves(entry, original, submission, hiddenInputs(entry, seed, count));
    const kind = entries[item.name] ?? 'none';
    const entryOk = isEntryOk(item.type, kind);
    const { p2, reclassify } = gradeReportItem(item, entry, report);
    return {
      name: item.name,
      fn: item.fn,
      type: item.type,
      p1: {
        typecheck,
        behaviour,
        entry: kind,
        entryOk,
        score: typecheck && behaviour && entryOk ? 1 : 0,
      },
      p2,
      reclassify,
    };
  });

  return {
    items,
    p1: mean(items.map((i) => i.p1.score)),
    p2: mean(items.map((i) => i.p2.score)),
    behaviourOnly: mean(items.map((i) => (i.p1.typecheck && i.p1.behaviour ? 1 : 0))),
    bundleBytes: code !== null && typecheck ? await bundleBytesOf(code, resolveDir) : null,
  };
}
