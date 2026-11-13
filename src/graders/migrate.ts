/**
 * migrate 과제의 채점과 기준 해답 계산.
 *
 * 통과 조건(1차 지표 "요구 충족"): 동작 보존 ∧ 타입 검사 ∧ 번들 크기 ≤ 기준 × (1 + ε).
 * 기준은 사람이 정하지 않는다. 사전 등록한 후보의 모든 조합을 같은 채점기에 통과시켜
 * 동작과 타입이 보존되는 것 중 가장 작은 크기로 정한다.
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Candidate, enumerateCandidates } from '../reference/candidates.js';
import { gradingInputs, type MigrateTask } from '../tasks/spec.js';
import { type AnyFunction, compareBehaviour, type Mismatch } from './behaviour.js';
import { loadModuleFromSource } from './load.js';
import { measureBundleSize, withinSizeBudget } from './size.js';
import { typeCheck, type TypeCheckResult } from './typecheck.js';

export interface BehaviourCheck {
  readonly passed: boolean;
  /** 불러오기에 실패했거나 함수가 없을 때의 사유. */
  readonly loadError: string | null;
  /** 내보낸 함수 이름 → 불일치 목록. */
  readonly mismatches: Readonly<Record<string, readonly Mismatch[]>>;
}

export interface MigrateGrade {
  readonly behaviour: BehaviourCheck;
  readonly types: TypeCheckResult;
  /** 번들한 gzip 바이트 수. 번들에 실패하면 null. */
  readonly size: number | null;
  /** 번들에서 제출 파일 자신의 코드가 차지하는 바이트 수. 번들에 실패하면 null. */
  readonly ownBytes: number | null;
  /** 정확성: 동작 보존 ∧ 타입 검사. 번들 크기 조건을 뺀 값이다. */
  readonly correct: boolean;
}

async function measure(
  code: string,
  resolveDir: string,
): Promise<{ gzipped: number; ownBytes: number } | null> {
  const dir = join(resolveDir, '.grade-tmp', `size-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  try {
    const entry = join(dir, 'entry.ts');
    writeFileSync(entry, code, 'utf8');
    const { gzipped, ownBytes } = await measureBundleSize(entry, resolveDir);
    return { gzipped, ownBytes };
  } catch {
    return null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function checkBehaviour(
  task: MigrateTask,
  originalSource: string,
  submission: string,
  resolveDir: string,
): Promise<BehaviourCheck> {
  let original: Readonly<Record<string, unknown>>;
  let migrated: Readonly<Record<string, unknown>>;
  try {
    original = await loadModuleFromSource(originalSource, resolveDir);
  } catch (error) {
    // 원본이 실행되지 않으면 과제 자체의 결함이다. 채점 결과로 숨기지 않는다.
    throw new Error(`과제 ${task.id}의 원본을 불러오지 못했다`, { cause: error });
  }
  try {
    migrated = await loadModuleFromSource(submission, resolveDir);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { passed: false, loadError: `제출물을 불러오지 못했다: ${reason}`, mismatches: {} };
  }

  const mismatches: Record<string, readonly Mismatch[]> = {};
  for (const spec of task.exports) {
    const expected = original[spec.name];
    const actual = migrated[spec.name];
    if (typeof expected !== 'function') {
      throw new Error(`과제 ${task.id}의 원본에 함수 ${spec.name}이 없다`);
    }
    if (typeof actual !== 'function') {
      return { passed: false, loadError: `제출물에 함수 ${spec.name}이 없다`, mismatches };
    }
    const result = compareBehaviour(
      expected as AnyFunction,
      actual as AnyFunction,
      gradingInputs(spec),
    );
    if (!result.passed) mismatches[spec.name] = result.mismatches;
  }
  return { passed: Object.keys(mismatches).length === 0, loadError: null, mismatches };
}

/** 제출물 하나를 채점한다. 번들 크기 기준과는 무관한 측정값만 낸다. */
export async function gradeMigrate(
  task: MigrateTask,
  originalSource: string,
  submission: string,
  resolveDir: string,
): Promise<MigrateGrade> {
  const behaviour = await checkBehaviour(task, originalSource, submission, resolveDir);
  const types = typeCheck(submission, originalSource, resolveDir);
  const measured = await measure(submission, resolveDir);
  return {
    behaviour,
    types,
    size: measured?.gzipped ?? null,
    ownBytes: measured?.ownBytes ?? null,
    correct: behaviour.passed && types.passed,
  };
}

/**
 * 요구 충족: 정확하고 번들 크기가 기준 이하다.
 * ownCodeLimit을 주면 "유틸리티를 직접 구현하지 않는다"는 요구도 함께 본다.
 * 제출 파일 자신의 코드가 번들에서 차지하는 바이트가 그 한도를 넘으면 실패다.
 */
export function meetsRequirement(
  grade: MigrateGrade,
  referenceSize: number,
  epsilon: number,
  ownCodeLimit?: number,
): boolean {
  if (!grade.correct || grade.size === null || grade.ownBytes === null) return false;
  if (!withinSizeBudget(grade.size, referenceSize, epsilon)) return false;
  return ownCodeLimit === undefined || grade.ownBytes <= ownCodeLimit;
}

export interface GradedCandidate {
  readonly choices: Candidate['choices'];
  readonly correct: boolean;
  readonly size: number | null;
  readonly ownBytes: number | null;
}

export interface Reference {
  /** 기준 해답의 선택. */
  readonly choices: Candidate['choices'];
  /** 기준 해답의 번들 크기. */
  readonly size: number;
  /** 기준 해답에서 제출 파일 자신의 코드가 차지하는 바이트 수. 어댑터가 있으면 여기에 들어간다. */
  readonly ownBytes: number;
  /**
   * 정확한 후보 가운데 기준 해답보다 큰 것 중 가장 작은 크기. 없으면 null.
   * 크기가 기준 해답과 같은 후보는 같은 부류로 묶고 비교하지 않는다.
   */
  readonly nextSize: number | null;
  readonly candidates: readonly GradedCandidate[];
}

/** 모든 후보 조합을 채점해 기준 해답을 정한다. */
export async function computeReference(
  task: MigrateTask,
  originalSource: string,
  resolveDir: string,
): Promise<Reference> {
  const graded: GradedCandidate[] = [];
  for (const candidate of enumerateCandidates(originalSource, task.slots)) {
    const grade = await gradeMigrate(task, originalSource, candidate.code, resolveDir);
    graded.push({
      choices: candidate.choices,
      correct: grade.correct,
      size: grade.size,
      ownBytes: grade.ownBytes,
    });
  }
  const valid = graded
    .filter(
      (c): c is GradedCandidate & { size: number; ownBytes: number } =>
        c.correct && c.size !== null && c.ownBytes !== null,
    )
    .sort((a, b) => a.size - b.size);
  const best = valid[0];
  if (best === undefined) {
    throw new Error(`과제 ${task.id}: 동작과 타입이 보존되는 후보가 하나도 없다`);
  }
  const next = valid.find((c) => c.size > best.size);
  return {
    choices: best.choices,
    size: best.size,
    ownBytes: best.ownBytes,
    nextSize: next?.size ?? null,
    candidates: graded,
  };
}

/**
 * 크기 분리 조건(과제 채택 조건): 기준 해답 다음으로 작은 정확한 후보와의 차이가
 * 2ε × 기준 이상이어야 한다. 차이가 그보다 작으면 허용 오차가 잘못 고른 답을 통과시킨다.
 */
export function isSizeSeparated(reference: Reference, epsilon: number): boolean {
  if (reference.nextSize === null) return false;
  return reference.nextSize - reference.size >= 2 * epsilon * reference.size;
}
