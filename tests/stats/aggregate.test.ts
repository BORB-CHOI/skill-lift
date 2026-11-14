import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  armScores,
  cellRuns,
  itemPassRates,
  manipulationFlags,
  medianItemCount,
  runCost,
  runDurationMs,
  runScore,
  runTurnCount,
  summarize,
  type Grade,
  type RunMeta,
  type RunRecord,
} from '../../src/stats/aggregate.js';
import { loadRuns } from '../../src/stats/load-runs.js';
import { parsePreregistration } from '../../src/stats/prereg.js';

const meta: RunMeta = {
  runId: 'recharts__skill__1',
  taskId: 'recharts',
  arm: 'skill',
  repeat: 1,
  state: 'completed',
  model: 'claude-sonnet-5-5',
  turns: [
    {
      usage: { input: 1_000_000, output: 0, cacheRead: 0, cacheCreation: 0 },
      durationMs: 1000,
      numTurns: 10,
    },
    {
      usage: { input: 0, output: 1_000_000, cacheRead: 1_000_000, cacheCreation: 1_000_000 },
      durationMs: 500,
      numTurns: 3,
    },
  ],
  ranAvailabilityCheck: true,
  readEsToolkitSource: false,
  manipulation: { extra: true },
};
const grade = (passes: boolean[]): Grade => ({
  project: 'recharts',
  items: passes.map((pass, i) => ({ id: `check-${i}`, kind: i === 0 ? 'hidden' : 'public', pass })),
  score: passes.filter(Boolean).length / passes.length,
});
const run = (partial: Partial<RunMeta>, g: Grade | null): RunRecord => ({
  meta: { ...meta, ...partial },
  grade: g,
});

describe('실행 점수', () => {
  const runs: RunRecord[] = [
    run({ arm: 'baseline', repeat: 2, state: 'completed' }, grade([true, false])),
    run({ arm: 'baseline', repeat: 1, state: 'limit' }, null),
    run({ arm: 'baseline', repeat: 3, state: 'contaminated' }, grade([true, true])),
    run({ arm: 'baseline', repeat: 4, state: 'infra' }, null),
    run({ arm: 'baseline', repeat: 5, state: 'completed' }, null),
    run({ arm: 'skill', repeat: 1, model: 'claude-haiku-5-5' }, grade([true, true])),
    run({ arm: 'skill', repeat: 2, taskId: 'other' }, grade([true, true])),
  ];

  it('limit은 0점, contaminated·infra·채점 없음은 뺀다', () => {
    expect(runScore(runs[1] as RunRecord)).toBe(0);
    expect(runScore(runs[2] as RunRecord)).toBeNull();
    expect(armScores(runs, 'baseline')).toEqual([0, 0.5]);
  });

  it('프로젝트와 모델로 셀을 가른다. requestedModel이 있으면 그 값을 쓴다', () => {
    expect(cellRuns(runs, 'recharts', 'claude-sonnet-5-5')).toHaveLength(5);
    expect(cellRuns(runs, 'recharts', 'claude-haiku-5-5')).toHaveLength(1);
    const requested = run(
      { model: 'claude-sonnet-5-5-20261001', requestedModel: 'claude-sonnet-5-5' },
      null,
    );
    expect(cellRuns([requested], 'recharts', 'claude-sonnet-5-5')).toHaveLength(1);
  });

  it('요약은 표본 표준편차(n − 1)를 쓴다', () => {
    const s = summarize([0, 1]);
    expect(s).toEqual({ n: 2, mean: 0.5, sd: Math.sqrt(0.5) });
    expect(summarize([0.3]).sd).toBeNull();
    expect(summarize([]).mean).toBeNull();
  });

  it('항목 통과율은 limit 실행을 실패로 세고 빠진 실행은 세지 않는다', () => {
    const rates = itemPassRates(runs, 'baseline');
    expect(rates).toEqual([
      { id: 'check-0', kind: 'hidden', passed: 1, runs: 2 },
      { id: 'check-1', kind: 'public', passed: 0, runs: 2 },
    ]);
    expect(medianItemCount(runs)).toBe(2);
  });
});

describe('턴 합산', () => {
  const pricing = { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 };

  it('비용은 두 턴의 usage를 모두 더한다', () => {
    // 첫 턴 입력 $2 + 둘째 턴 출력 $10 + 캐시 읽기 $0.1 + 캐시 쓰기 $2.5
    expect(runCost(meta, pricing)).toBeCloseTo(14.6, 10);
  });

  it('시간과 턴 수도 두 턴의 합이다', () => {
    expect(runDurationMs(meta)).toBe(1500);
    expect(runTurnCount(meta)).toBe(13);
  });

  it('턴 기록이 없으면 null이다', () => {
    const bare: RunMeta = { ...meta, turns: [] };
    expect(runCost(bare, pricing)).toBeNull();
    expect(runDurationMs(bare)).toBeNull();
  });
});

describe('manipulationFlags', () => {
  it('최상위 boolean과 manipulation 객체를 합치고 기록 없는 키는 뺀다', () => {
    expect(manipulationFlags(meta)).toEqual({
      extra: true,
      ranAvailabilityCheck: true,
      readEsToolkitSource: false,
    });
  });
});

describe('loadRuns', () => {
  const root = mkdtempSync(join(tmpdir(), 'load-runs-'));
  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('runId가 없으면 폴더 이름을 쓰고 grade.json을 붙인다', () => {
    const dir = join(root, 'recharts__baseline__1');
    mkdirSync(dir);
    const withoutId = Object.fromEntries(Object.entries(meta).filter(([key]) => key !== 'runId'));
    writeFileSync(join(dir, 'meta.json'), JSON.stringify({ ...withoutId, arm: 'baseline' }));
    writeFileSync(join(dir, 'grade.json'), JSON.stringify(grade([true, false])));
    const [loaded] = loadRuns(root);
    expect(loaded?.meta.runId).toBe('recharts__baseline__1');
    expect(loaded?.grade?.score).toBe(0.5);
  });

  it('score가 0..1 밖이면 오류다', () => {
    const dir = join(root, 'recharts__baseline__2');
    mkdirSync(dir);
    writeFileSync(join(dir, 'meta.json'), JSON.stringify({ ...meta, repeat: 2 }));
    writeFileSync(join(dir, 'grade.json'), JSON.stringify({ ...grade([true]), score: 2 }));
    expect(() => loadRuns(root)).toThrow(RangeError);
  });
});

describe('parsePreregistration', () => {
  const pricing = {
    'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
    'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
  };

  it('모델별 단가를 읽고 cacheWrite가 없으면 input × 1.25다', () => {
    const p = parsePreregistration({ alpha: 0.05, delta: 0.15, K: 10, pricing });
    expect(p.projects).toEqual(['recharts', 'swagger-typescript-api']);
    expect(p.models).toEqual(['claude-sonnet-5-5', 'claude-haiku-5-5']);
    expect(p.pricing['claude-haiku-5-5']?.cacheWrite).toBeCloseTo(0.125, 12);
  });

  it('등록한 모델의 단가가 없으면 오류다', () => {
    expect(() =>
      parsePreregistration({ alpha: 0.05, delta: 0.15, K: 10, models: ['claude-x-1-0'], pricing }),
    ).toThrow(/pricing\.claude-x-1-0/);
  });
});
