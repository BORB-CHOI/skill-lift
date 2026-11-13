/**
 * migrate 과제의 형식.
 *
 * 공개 부분(task.json)은 에이전트에게 주어지는 것과 같다: 대상 파일, 입력 범위, 예시 입력.
 * 비공개 부분(sealed.json)은 본 실행이 끝날 때까지 공개하지 않는다: 함수별 후보 코드와
 * 비공개 입력. 사전 등록에는 비공개 파일의 해시만 올린다.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** 과제 파일 안의 lodash import 한 줄과, 그 줄을 대체할 수 있는 후보들. */
export interface Slot {
  /** lodash 함수 이름. 보고용이다. */
  readonly name: string;
  /** 원본 파일에 정확히 한 번 나오는 import 줄. 이 줄을 그대로 두는 것이 keep 후보다. */
  readonly original: string;
  /**
   * 후보 이름 → 원본 줄을 대체할 코드. 어댑터가 필요하면 여러 줄을 넣는다.
   * 관례: strict(es-toolkit), compat(es-toolkit/compat), adapted(strict + 어댑터).
   */
  readonly variants: Readonly<Record<string, string>>;
}

export interface ExportSpec {
  /** 과제 파일이 내보내는 함수 이름. 시그니처는 바꾸지 못한다. */
  readonly name: string;
  /** 과제 문장에 공개하는 예시 입력. 각 항목은 인자 목록이다. */
  readonly examples: readonly (readonly unknown[])[];
  /** 과제 문장의 입력 범위 안에서 뽑은 비공개 입력. */
  readonly hidden: readonly (readonly unknown[])[];
}

export interface MigrateTask {
  readonly id: string;
  /** 과제 폴더 기준 대상 파일 경로. */
  readonly file: string;
  /** 과제 문장에 적는 입력 범위(인자별 타입, 길이, 값 범위). */
  readonly inputRange: string;
  readonly slots: readonly Slot[];
  readonly exports: readonly ExportSpec[];
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(source: Json, key: string, where: string): string {
  const value = source[key];
  if (typeof value !== 'string' || value === '') {
    throw new TypeError(`${where}: "${key}"는 비어 있지 않은 문자열이어야 한다`);
  }
  return value;
}

function requireArray(source: Json, key: string, where: string): unknown[] {
  const value = source[key];
  if (!Array.isArray(value)) throw new TypeError(`${where}: "${key}"는 배열이어야 한다`);
  return value as unknown[];
}

function parseInputs(value: unknown, where: string): unknown[][] {
  if (!Array.isArray(value)) throw new TypeError(`${where}: 입력 목록은 배열이어야 한다`);
  return value.map((args, i) => {
    if (!Array.isArray(args)) {
      throw new TypeError(`${where}[${i}]: 각 입력은 인자 배열이어야 한다`);
    }
    return args as unknown[];
  });
}

function parseSlot(value: unknown, where: string): Slot {
  if (!isObject(value)) throw new TypeError(`${where}: 객체여야 한다`);
  const variantsRaw = value['variants'];
  if (!isObject(variantsRaw)) throw new TypeError(`${where}: "variants"는 객체여야 한다`);
  const variants: Record<string, string> = {};
  for (const [name, code] of Object.entries(variantsRaw)) {
    if (name === 'keep') throw new TypeError(`${where}: "keep"은 예약된 후보 이름이다`);
    if (typeof code !== 'string')
      throw new TypeError(`${where}: 후보 "${name}"은 문자열이어야 한다`);
    variants[name] = code;
  }
  return {
    name: requireString(value, 'name', where),
    original: requireString(value, 'original', where),
    variants,
  };
}

/** 공개 부분과 비공개 부분을 합쳐 과제 하나를 만든다. 형식이 틀리면 바로 실패한다. */
export function parseMigrateTask(publicPart: unknown, sealedPart: unknown): MigrateTask {
  if (!isObject(publicPart)) throw new TypeError('task.json: 객체여야 한다');
  if (!isObject(sealedPart)) throw new TypeError('sealed.json: 객체여야 한다');
  const id = requireString(publicPart, 'id', 'task.json');

  const hiddenByName = isObject(sealedPart['hidden']) ? sealedPart['hidden'] : {};
  const exports = requireArray(publicPart, 'exports', 'task.json').map((item, i) => {
    const where = `task.json exports[${i}]`;
    if (!isObject(item)) throw new TypeError(`${where}: 객체여야 한다`);
    const name = requireString(item, 'name', where);
    return {
      name,
      examples: parseInputs(item['examples'], `${where}.examples`),
      hidden: parseInputs(hiddenByName[name] ?? [], `sealed.json hidden.${name}`),
    };
  });
  if (exports.length === 0) throw new TypeError('task.json: exports가 비어 있다');

  const slots = requireArray(sealedPart, 'slots', 'sealed.json').map((item, i) =>
    parseSlot(item, `sealed.json slots[${i}]`),
  );
  if (slots.length === 0) throw new TypeError('sealed.json: slots가 비어 있다');

  return {
    id,
    file: requireString(publicPart, 'file', 'task.json'),
    inputRange: requireString(publicPart, 'inputRange', 'task.json'),
    slots,
    exports,
  };
}

export interface LoadedTask {
  readonly task: MigrateTask;
  /** 대상 파일의 원본 내용. 줄바꿈은 LF로 통일한다. */
  readonly source: string;
}

function readText(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

export function loadMigrateTask(taskDir: string, sealedFile: string): LoadedTask {
  const publicPart: unknown = JSON.parse(readText(join(taskDir, 'task.json')));
  const sealedPart: unknown = JSON.parse(readText(sealedFile));
  const task = parseMigrateTask(publicPart, sealedPart);
  return { task, source: readText(join(taskDir, task.file)) };
}

/** 채점에 쓰는 입력 목록: 공개한 예시와 비공개 입력을 합친 것. */
export function gradingInputs(spec: ExportSpec): readonly (readonly unknown[])[] {
  return [...spec.examples, ...spec.hidden];
}
