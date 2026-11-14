import { describe, expect, it } from 'vitest';
import {
  manipulationFlags,
  runCost,
  runDurationMs,
  runTurnCount,
  type RunMeta,
} from '../../src/stats/aggregate.js';

const meta: RunMeta = {
  runId: 'task-01__skill__1',
  taskId: 'task-01',
  arm: 'skill',
  repeat: 1,
  state: 'completed',
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
const pricing = { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 };

describe('턴 합산', () => {
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
