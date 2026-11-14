/**
 * 사전 등록 JSON에서 채점·판정에 필요한 값만 읽는다.
 *
 * 읽는 키(USD는 1M 토큰당 단가):
 * - 목적별 대상 과제: `tasks.p1`, `tasks.p2` (없으면 `hypothesisTasks`, `hypotheses` 아래의 p1·p2)
 * - `delta`, `alpha`, `K`
 * - `pricing.input`, `pricing.output`, `pricing.cacheRead`, `pricing.cacheWrite`
 *   (`inputPerMTok` 형태도 받는다. cacheWrite가 없으면 input × 1.25, 설계 6.3)
 * - 선택: `referenceBundleBytes` = { 과제 ID: 기준 해답 번들 바이트 }
 * 값이 없거나 형식이 틀리면 키 이름을 담아 오류를 낸다.
 */
import type { Pricing } from './aggregate.js';

export interface Preregistration {
  readonly tasks: { readonly p1: readonly string[]; readonly p2: readonly string[] };
  readonly delta: number;
  readonly alpha: number;
  readonly k: number;
  readonly pricing: Pricing;
  readonly referenceBundleBytes: Readonly<Record<string, number>>;
}

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function stringArray(value: unknown, key: string): string[] {
  if (!Array.isArray(value) || !value.every((v): v is string => typeof v === 'string')) {
    throw new TypeError(`사전 등록의 ${key}는 문자열 배열이어야 한다`);
  }
  return value;
}

function positiveNumber(value: unknown, key: string): number {
  if (typeof value !== 'number' || !(value > 0) || !Number.isFinite(value)) {
    throw new TypeError(`사전 등록의 ${key}는 양수여야 한다`);
  }
  return value;
}

function readTasks(root: Json): Preregistration['tasks'] {
  for (const key of ['tasks', 'hypothesisTasks', 'hypotheses']) {
    const node = root[key];
    if (isObject(node) && 'p1' in node && 'p2' in node) {
      return { p1: stringArray(node['p1'], `${key}.p1`), p2: stringArray(node['p2'], `${key}.p2`) };
    }
  }
  throw new TypeError('사전 등록에 목적별 과제 집합(tasks.p1, tasks.p2)이 없다');
}

function readPrice(node: Json, name: string): number | undefined {
  const value = node[name] ?? node[`${name}PerMTok`];
  return value === undefined ? undefined : positiveNumber(value, `pricing.${name}`);
}

function readPricing(root: Json): Pricing {
  const node = root['pricing'];
  if (!isObject(node)) throw new TypeError('사전 등록에 pricing이 없다');
  const input = readPrice(node, 'input');
  const output = readPrice(node, 'output');
  const cacheRead = readPrice(node, 'cacheRead');
  if (input === undefined || output === undefined || cacheRead === undefined) {
    throw new TypeError('pricing에는 input, output, cacheRead가 모두 있어야 한다');
  }
  return { input, output, cacheRead, cacheWrite: readPrice(node, 'cacheWrite') ?? input * 1.25 };
}

function readBundles(root: Json): Record<string, number> {
  const node = root['referenceBundleBytes'];
  if (node === undefined) return {};
  if (!isObject(node)) throw new TypeError('referenceBundleBytes는 객체여야 한다');
  const out: Record<string, number> = {};
  for (const [taskId, bytes] of Object.entries(node)) {
    out[taskId] = positiveNumber(bytes, `referenceBundleBytes.${taskId}`);
  }
  return out;
}

export function parsePreregistration(raw: unknown): Preregistration {
  if (!isObject(raw)) throw new TypeError('사전 등록 파일이 JSON 객체가 아니다');
  const alpha = positiveNumber(raw['alpha'], 'alpha');
  const delta = positiveNumber(raw['delta'], 'delta');
  if (alpha >= 1 || delta >= 1) throw new RangeError('alpha와 delta는 1보다 작아야 한다');
  const k = positiveNumber(raw['K'] ?? raw['k'], 'K');
  return {
    tasks: readTasks(raw),
    delta,
    alpha,
    k,
    pricing: readPricing(raw),
    referenceBundleBytes: readBundles(raw),
  };
}
