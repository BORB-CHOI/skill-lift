/**
 * 사전 등록 JSON에서 채점·판정에 필요한 값만 읽는다.
 *
 * 읽는 키:
 * - `delta`, `alpha`, `K`
 * - `projects`, `models`: 가설 묶음을 이루는 목록. 없으면 decision.ts의 설계값을 쓴다.
 * - `pricing.<모델 ID>.{input, output, cacheRead, cacheWrite}`: 1M 토큰당 USD.
 *   `inputPerMTok` 형태도 받는다. cacheWrite가 없으면 input × 1.25다.
 * 값이 없거나 형식이 틀리면 키 이름을 담아 오류를 낸다.
 */
import type { Pricing } from './aggregate.js';
import { DESIGN_MODELS, DESIGN_PROJECTS } from './decision.js';

export interface Preregistration {
  readonly delta: number;
  readonly alpha: number;
  readonly k: number;
  readonly projects: readonly string[];
  readonly models: readonly string[];
  readonly pricing: Readonly<Record<string, Pricing>>;
}

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function stringArray(value: unknown, key: string, fallback: readonly string[]): string[] {
  if (value === undefined) return [...fallback];
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every((v): v is string => typeof v === 'string')
  ) {
    throw new TypeError(`사전 등록의 ${key}는 비어 있지 않은 문자열 배열이어야 한다`);
  }
  return value;
}

function positiveNumber(value: unknown, key: string): number {
  if (typeof value !== 'number' || !(value > 0) || !Number.isFinite(value)) {
    throw new TypeError(`사전 등록의 ${key}는 양수여야 한다`);
  }
  return value;
}

function readPrice(node: Json, name: string, key: string): number | undefined {
  const value = node[name] ?? node[`${name}PerMTok`];
  return value === undefined ? undefined : positiveNumber(value, `${key}.${name}`);
}

function readModelPricing(root: Json, model: string): Pricing {
  const pricing = root['pricing'];
  if (!isObject(pricing)) throw new TypeError('사전 등록에 pricing이 없다');
  const node = pricing[model];
  const key = `pricing.${model}`;
  if (!isObject(node)) throw new TypeError(`사전 등록에 ${key}가 없다`);
  const input = readPrice(node, 'input', key);
  const output = readPrice(node, 'output', key);
  const cacheRead = readPrice(node, 'cacheRead', key);
  if (input === undefined || output === undefined || cacheRead === undefined) {
    throw new TypeError(`${key}에는 input, output, cacheRead가 모두 있어야 한다`);
  }
  return {
    input,
    output,
    cacheRead,
    cacheWrite: readPrice(node, 'cacheWrite', key) ?? input * 1.25,
  };
}

export function parsePreregistration(raw: unknown): Preregistration {
  if (!isObject(raw)) throw new TypeError('사전 등록 파일이 JSON 객체가 아니다');
  const alpha = positiveNumber(raw['alpha'], 'alpha');
  const delta = positiveNumber(raw['delta'], 'delta');
  if (alpha >= 1 || delta >= 1) throw new RangeError('alpha와 delta는 1보다 작아야 한다');
  const k = positiveNumber(raw['K'] ?? raw['k'], 'K');
  const projects = stringArray(raw['projects'], 'projects', DESIGN_PROJECTS);
  const models = stringArray(raw['models'], 'models', DESIGN_MODELS);
  const pricing: Record<string, Pricing> = {};
  for (const model of models) pricing[model] = readModelPricing(raw, model);
  return { delta, alpha, k, projects, models, pricing };
}
