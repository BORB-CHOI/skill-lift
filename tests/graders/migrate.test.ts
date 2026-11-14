import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { TRIVIAL_ARMS } from '../../src/arms/trivial.js';
import {
  computeReference,
  gradeMigrate,
  isSizeSeparated,
  meetsRequirement,
  type Reference,
} from '../../src/graders/migrate.js';
import { enumerateCandidates, uniformCandidate } from '../../src/reference/candidates.js';
import { loadMigrateTask, type LoadedTask } from '../../src/tasks/spec.js';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const taskDir = fileURLToPath(
  new URL('../../suites/es-toolkit/migrate/pilot/pilot-01/', import.meta.url),
);
const EPSILON = 0.05;

let loaded: LoadedTask;
let reference: Reference;

beforeAll(async () => {
  loaded = loadMigrateTask(taskDir, `${taskDir}sealed.json`);
  reference = await computeReference(loaded.task, loaded.source, repoRoot);
}, 300_000);

async function grade(submission: string) {
  return gradeMigrate(loaded.task, loaded.source, submission, repoRoot);
}

describe('후보 조합', () => {
  it('슬롯별 선택지의 곱만큼 조합을 만든다', () => {
    // groupBy 3 × uniqBy 4 × fromPairs 2 × sortedUniq 1
    expect(enumerateCandidates(loaded.source, loaded.task.slots)).toHaveLength(24);
  });

  it('후보가 없는 슬롯이 있으면 균일 조합을 만들지 못한다', () => {
    expect(uniformCandidate(loaded.source, loaded.task.slots, 'compat')).toBeNull();
    expect(uniformCandidate(loaded.source, loaded.task.slots, 'keep')?.code).toBe(loaded.source);
  });
});

describe('기준 해답', () => {
  it('동작과 타입이 보존되는 조합 중 가장 작은 것을 고른다', () => {
    expect(reference.choices).toEqual({
      groupBy: 'strict',
      uniqBy: 'adapted',
      fromPairs: 'compat',
      sortedUniq: 'keep',
    });
  });

  it('문자열 iteratee를 받지 않는 strict uniqBy 조합은 정확하지 않다', () => {
    const strictUniqBy = reference.candidates.filter((c) => c.choices['uniqBy'] === 'strict');
    expect(strictUniqBy).toHaveLength(6);
    expect(strictUniqBy.every((c) => !c.correct)).toBe(true);
  });

  it('다음으로 작은 후보와 허용 오차의 2배 이상 떨어져 있다', () => {
    expect(reference.nextSize).not.toBeNull();
    expect(isSizeSeparated(reference, EPSILON)).toBe(true);
  });
});

describe('치환 스크립트', () => {
  it('전부 compat으로 바꾸면 es-toolkit에 없는 함수 때문에 불러오지 못한다', async () => {
    const g = await grade(TRIVIAL_ARMS['trivial-compat'](loaded.source));
    expect(g.behaviour.passed).toBe(false);
    expect(meetsRequirement(g, reference.size, EPSILON)).toBe(false);
  });

  it('전부 strict로 바꿔도 통과하지 못한다', async () => {
    const g = await grade(TRIVIAL_ARMS['trivial-strict'](loaded.source));
    expect(meetsRequirement(g, reference.size, EPSILON)).toBe(false);
  });

  it('그대로 두면 정확하지만 번들 크기 기준을 넘는다', async () => {
    const g = await grade(TRIVIAL_ARMS['trivial-keep'](loaded.source));
    expect(g.correct).toBe(true);
    expect(meetsRequirement(g, reference.size, EPSILON)).toBe(false);
  });
});

describe('제출물 채점', () => {
  const header = `export interface Row { id: number; name: string }\n`;

  it('직접 구현한 답도 동작이 같고 크기가 기준 이하면 통과한다', async () => {
    const native = `${header}
export function byName(rows: Row[]): Record<string, Row[]> {
  const out: Record<string, Row[]> = {};
  for (const row of rows) (out[row.name] ??= []).push(row);
  return out;
}
export function uniqueRows(rows: Row[]): Row[] {
  const seen = new Set<number>();
  return rows.filter((row) => (seen.has(row.id) ? false : (seen.add(row.id), true)));
}
export function toLookup(pairs: [string, number][]): Record<string, number> {
  return Object.fromEntries(pairs);
}
export function dedupeSorted(values: number[]): number[] {
  return values.filter((value, i) => i === 0 || value !== values[i - 1]);
}
`;
    const g = await grade(native);
    expect(g.behaviour).toMatchObject({ passed: true, loadError: null });
    expect(g.types.passed).toBe(true);
    expect(meetsRequirement(g, reference.size, EPSILON)).toBe(true);
  });

  it('예시 입력에만 맞춘 하드코딩은 비공개 입력에서 걸린다', async () => {
    const hardcoded = `${header}
export function byName(rows: Row[]): Record<string, Row[]> {
  return rows.length === 0 ? {} : { a: [rows[0]!, rows[2]!], b: [rows[1]!] };
}
export function uniqueRows(rows: Row[]): Row[] {
  return rows.length === 0 ? [] : [rows[0]!, rows[2]!];
}
export function toLookup(pairs: [string, number][]): Record<string, number> {
  return { a: 1, b: 2 };
}
export function dedupeSorted(values: number[]): number[] {
  return [1, 2, 3];
}
`;
    const g = await grade(hardcoded);
    expect(g.behaviour.passed).toBe(false);
    expect(Object.keys(g.behaviour.mismatches).sort()).toEqual([
      'byName',
      'dedupeSorted',
      'toLookup',
      'uniqueRows',
    ]);
  });

  it('타입 검사를 끄는 주석을 넣으면 실패한다', async () => {
    const best = enumerateCandidates(loaded.source, loaded.task.slots).find(
      (c) => JSON.stringify(c.choices) === JSON.stringify(reference.choices),
    );
    expect(best).toBeDefined();
    const bypassed = `// @ts-nocheck\n${best?.code ?? ''}`;
    const g = await grade(bypassed);
    expect(g.behaviour.passed).toBe(true);
    expect(g.types.passed).toBe(false);
    expect(g.correct).toBe(false);
  });

  it('내보내는 함수를 빠뜨리면 실패한다', async () => {
    const g = await grade(`export const byName = () => ({});\n`);
    expect(g.behaviour.passed).toBe(false);
    expect(g.behaviour.loadError).toContain('uniqueRows');
  });
});
