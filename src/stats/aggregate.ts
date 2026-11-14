/**
 * 실행 결과(meta.json, grade.json)를 과제·조건 단위 점수로 모은다 (설계 6절, 8절).
 *
 * 실행 점수는 그 실행의 항목 평균이다(grade.json의 p1, p2).
 * - completed: grade.json의 값을 쓴다. grade.json이 없으면 결측으로 둔다.
 * - limit: 두 목적 모두 0점이다.
 * - contaminated: 분석에서 뺀다.
 * - infra, harness: 결측이다.
 * 과제·조건 점수는 실행 점수의 평균이고, 과제별 차이는 skill − 대조다.
 */
import type { ControlArm, Purpose } from './decision.js';
import { mean } from './paired.js';

export type Arm = 'baseline' | 'skill' | 'placebo';
export type RunStateName = 'completed' | 'limit' | 'infra' | 'contaminated' | 'harness';
export type ItemType = 'S' | 'D' | 'C';

export interface RunMeta {
  readonly runId: string;
  readonly taskId: string;
  readonly arm: Arm;
  readonly repeat: number;
  readonly state: RunStateName;
  /** 턴별 기록. 본 실행은 두 턴이다. */
  readonly turns?: readonly TurnRecord[];
  /** 첫 턴 init 메시지에 로드된 Skill 이름. */
  readonly loadedSkills?: readonly string[];
  /** 조작 확인 지표 (설계 6.4). */
  readonly ranAvailabilityCheck?: boolean;
  readonly readEsToolkitSource?: boolean;
  readonly ranLodashComparison?: boolean;
  readonly networkAttempts?: readonly unknown[];
  /** 추가 조작 확인 지표. 키마다 그 행동을 했는지. */
  readonly manipulation?: Readonly<Record<string, boolean>>;
}

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

export interface GradeItem {
  readonly name: string;
  readonly fn: string;
  readonly type: ItemType;
  readonly p1: { readonly score: number };
  readonly p2: { readonly score: number };
  readonly reclassify?: boolean;
}

export interface Grade {
  readonly items: readonly GradeItem[];
  readonly p1: number;
  readonly p2: number;
  readonly behaviourOnly: number;
  readonly bundleBytes: number | null;
}

export interface RunRecord {
  readonly meta: RunMeta;
  /** completed이고 grade.json이 있을 때만 있다. */
  readonly grade: Grade | null;
}

/** 실행 하나의 목적별 점수. null은 분석에서 빠지는 실행이다. */
export function runScore(run: RunRecord, purpose: Purpose): number | null {
  switch (run.meta.state) {
    case 'limit':
      return 0;
    case 'completed':
      return run.grade === null ? null : run.grade[purpose];
    case 'contaminated':
    case 'infra':
    case 'harness':
      return null;
  }
}

/** 과제·조건별 점수 = 실행 점수의 평균. 점수가 있는 실행이 없으면 null. */
export function taskArmMean(
  runs: readonly RunRecord[],
  taskId: string,
  arm: Arm,
  purpose: Purpose,
): number | null {
  const values = runs
    .filter((r) => r.meta.taskId === taskId && r.meta.arm === arm)
    .map((r) => runScore(r, purpose))
    .filter((v): v is number => v !== null);
  return values.length === 0 ? null : mean(values);
}

export interface PairedTask {
  readonly taskId: string;
  readonly skill: number;
  readonly control: number;
  readonly difference: number;
}

export interface PairedSet {
  readonly pairs: readonly PairedTask[];
  /** 한쪽 조건 점수가 없어 뺀 과제. */
  readonly dropped: readonly string[];
}

/** 사전 등록한 과제 집합에서 skill − 대조 차이를 만든다. */
export function pairTasks(
  runs: readonly RunRecord[],
  taskIds: readonly string[],
  control: ControlArm,
  purpose: Purpose,
): PairedSet {
  const pairs: PairedTask[] = [];
  const dropped: string[] = [];
  for (const taskId of taskIds) {
    const skill = taskArmMean(runs, taskId, 'skill', purpose);
    const ctrl = taskArmMean(runs, taskId, control, purpose);
    if (skill === null || ctrl === null) {
      dropped.push(taskId);
      continue;
    }
    pairs.push({ taskId, skill, control: ctrl, difference: skill - ctrl });
  }
  return { pairs, dropped };
}

/** 6.2의 재분류를 반영한 항목 유형. 재분류된 S 항목은 D로 센다. */
export function effectiveType(item: GradeItem): ItemType {
  return item.reclassify === true ? 'D' : item.type;
}

export interface TypeBreakdown {
  readonly type: ItemType;
  readonly items: number;
  readonly mean: number | null;
}

/**
 * 조건 하나의 목적 2 점수를 항목 유형별로 낸다. 과제 집합 안의 completed 실행 항목을 모두 모은
 * 단순 평균이다. limit 실행은 항목 목록이 없어 이 표에서 빠진다.
 */
export function p2ByType(
  runs: readonly RunRecord[],
  taskIds: readonly string[],
  arm: Arm,
): TypeBreakdown[] {
  const wanted = new Set(taskIds);
  const scores: Record<ItemType, number[]> = { S: [], D: [], C: [] };
  for (const run of runs) {
    if (run.meta.arm !== arm || !wanted.has(run.meta.taskId)) continue;
    if (run.meta.state !== 'completed' || run.grade === null) continue;
    for (const item of run.grade.items) scores[effectiveType(item)].push(item.p2.score);
  }
  return (['S', 'D', 'C'] as const).map((type) => ({
    type,
    items: scores[type].length,
    mean: scores[type].length === 0 ? null : mean(scores[type]),
  }));
}

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
