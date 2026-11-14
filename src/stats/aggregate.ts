/**
 * 실행 결과(meta.json, grade.json)를 실행 단위 점수로 모은다.
 *
 * 분석 단위는 실행이다. (프로젝트, 모델, 조건)마다 독립 실행 K개가 있고, 실행 점수는 그 실행에서
 * 통과한 채점 항목의 비율(grade.json의 score)이다.
 * - completed: grade.json의 score를 쓴다. grade.json이 없으면 결측으로 둔다.
 * - limit: 0점으로 넣는다.
 * - contaminated: 분석에서 뺀다.
 * - infra, harness: 결측이다.
 */
import { mean } from './paired.js';

export type Arm = 'baseline' | 'skill' | 'placebo';
export const ARMS: readonly Arm[] = ['baseline', 'skill', 'placebo'];
export type RunStateName = 'completed' | 'limit' | 'infra' | 'contaminated' | 'harness';
export const RUN_STATES: readonly RunStateName[] = [
  'completed',
  'limit',
  'infra',
  'contaminated',
  'harness',
];

export interface TokenUsage {
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheCreation: number;
}

export interface TurnRecord {
  readonly usage?: TokenUsage | null;
  readonly durationMs?: number | null;
  readonly numTurns?: number | null;
}

export interface RunMeta {
  /** 실행 폴더 이름. meta.json에 없으면 load-runs가 폴더 이름으로 채운다. */
  readonly runId: string;
  /** 프로젝트 이름 (예: recharts). */
  readonly taskId: string;
  readonly arm: Arm;
  readonly repeat: number;
  readonly state: RunStateName;
  /** 첫 턴 init 메시지에 찍힌 모델 ID. */
  readonly model?: string | null;
  /** 실행기에 넘긴 모델 ID. 있으면 이 값으로 모델을 가른다. */
  readonly requestedModel?: string | null;
  readonly turns?: readonly TurnRecord[];
  /** 첫 턴 init 메시지에 로드된 Skill 이름. */
  readonly loadedSkills?: readonly string[];
  readonly ranAvailabilityCheck?: boolean;
  readonly readEsToolkitSource?: boolean;
  readonly ranLodashComparison?: boolean;
  readonly networkAttempts?: readonly unknown[];
  /** 추가 조작 확인 지표. 키마다 그 행동을 했는지. */
  readonly manipulation?: Readonly<Record<string, boolean>>;
}

export interface GradeItem {
  readonly id: string;
  readonly kind: string;
  readonly pass: boolean;
}

export interface Grade {
  readonly project: string;
  readonly items: readonly GradeItem[];
  /** 통과한 항목의 비율, 0..1. */
  readonly score: number;
}

export interface RunRecord {
  readonly meta: RunMeta;
  /** grade.json이 있을 때만 있다. */
  readonly grade: Grade | null;
}

/** 실행의 모델 ID. 실행기에 넘긴 값을 먼저 쓴다. */
export const runModel = (meta: RunMeta): string | null => meta.requestedModel ?? meta.model ?? null;

/** 실행 하나의 점수. null은 분석에서 빠지는 실행이다. */
export function runScore(run: RunRecord): number | null {
  switch (run.meta.state) {
    case 'limit':
      return 0;
    case 'completed':
      return run.grade === null ? null : run.grade.score;
    case 'contaminated':
    case 'infra':
    case 'harness':
      return null;
  }
}

/** (프로젝트, 모델)에 속한 실행. */
export function cellRuns(runs: readonly RunRecord[], project: string, model: string): RunRecord[] {
  return runs.filter((r) => r.meta.taskId === project && runModel(r.meta) === model);
}

/** 한 조건의 분석 대상 실행 점수. 회차 순서로 낸다. */
export function armScores(runs: readonly RunRecord[], arm: Arm): number[] {
  return runs
    .filter((r) => r.meta.arm === arm)
    .sort((a, b) => a.meta.repeat - b.meta.repeat)
    .map(runScore)
    .filter((v): v is number => v !== null);
}

export interface Summary {
  readonly n: number;
  readonly mean: number | null;
  /** 표본 표준편차(n − 1). 실행이 2개 미만이면 null. */
  readonly sd: number | null;
}

export function summarize(values: readonly number[]): Summary {
  if (values.length === 0) return { n: 0, mean: null, sd: null };
  const m = mean(values);
  if (values.length < 2) return { n: values.length, mean: m, sd: null };
  const ss = values.reduce((s, v) => s + (v - m) ** 2, 0);
  return { n: values.length, mean: m, sd: Math.sqrt(ss / (values.length - 1)) };
}

export interface ItemPassRate {
  readonly id: string;
  readonly kind: string;
  readonly passed: number;
  /** 분석 대상 실행 수. limit 실행은 모든 항목을 통과하지 못한 것으로 센다. */
  readonly runs: number;
}

/**
 * 조건 하나의 항목별 통과 수. 점수와 같은 실행을 쓴다: completed(grade 있음)와 limit.
 * limit 실행은 점수 0과 맞추려고 모든 항목을 실패로 센다. 항목 목록은 grade.json에서 모은다.
 */
export function itemPassRates(runs: readonly RunRecord[], arm: Arm): ItemPassRate[] {
  const own = runs.filter((r) => r.meta.arm === arm && runScore(r) !== null);
  const kinds = new Map<string, string>();
  for (const run of runs) for (const item of run.grade?.items ?? []) kinds.set(item.id, item.kind);
  return [...kinds.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, kind]) => {
      let passed = 0;
      let counted = 0;
      for (const run of own) {
        if (run.meta.state === 'limit') {
          counted++;
          continue;
        }
        const item = run.grade?.items.find((i) => i.id === id);
        if (item === undefined) continue;
        counted++;
        if (item.pass) passed++;
      }
      return { id, kind, passed, runs: counted };
    });
}

/** 항목 수의 중앙값. grade.json이 없으면 null. */
export function medianItemCount(runs: readonly RunRecord[]): number | null {
  const counts = runs
    .map((r) => r.grade?.items.length)
    .filter((v): v is number => v !== undefined && v > 0)
    .sort((a, b) => a - b);
  return counts.length === 0 ? null : (counts[Math.floor(counts.length / 2)] ?? null);
}

const MANIPULATION_KEYS = [
  'ranAvailabilityCheck',
  'readEsToolkitSource',
  'ranLodashComparison',
] as const;

/** 조작 확인 지표. 최상위 boolean 세 개와 manipulation 객체를 합친다. 기록이 없는 키는 빠진다. */
export function manipulationFlags(meta: RunMeta): Record<string, boolean> {
  const flags: Record<string, boolean> = { ...(meta.manipulation ?? {}) };
  for (const key of MANIPULATION_KEYS) {
    const value = meta[key];
    if (typeof value === 'boolean') flags[key] = value;
  }
  return flags;
}

function sumTurns(
  meta: RunMeta,
  pick: (turn: TurnRecord) => number | null | undefined,
): number | null {
  const values = (meta.turns ?? []).map(pick).filter((v): v is number => typeof v === 'number');
  return values.length === 0 ? null : values.reduce((s, v) => s + v, 0);
}

/** 모든 턴의 실행 시간 합(ms). 기록이 없으면 null. */
export const runDurationMs = (meta: RunMeta): number | null => sumTurns(meta, (t) => t.durationMs);

/** 모든 턴의 에이전트 턴 수 합. 기록이 없으면 null. */
export const runTurnCount = (meta: RunMeta): number | null => sumTurns(meta, (t) => t.numTurns);

export interface Pricing {
  /** 1M 토큰당 달러. */
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
}

/** 실행 하나의 비용(달러). 모든 턴의 usage를 더한다. usage가 있는 턴이 없으면 null. */
export function runCost(meta: RunMeta, pricing: Pricing): number | null {
  const usages = (meta.turns ?? [])
    .map((t) => t.usage)
    .filter((u): u is TokenUsage => u !== undefined && u !== null);
  if (usages.length === 0) return null;
  let dollars = 0;
  for (const usage of usages) {
    dollars +=
      usage.input * pricing.input +
      usage.output * pricing.output +
      usage.cacheRead * pricing.cacheRead +
      usage.cacheCreation * pricing.cacheWrite;
  }
  return dollars / 1_000_000;
}
