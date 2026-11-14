import { describe, expect, it } from 'vitest';
import { buildRunPlan, executePlan } from '../../src/runner/plan.js';
import { classifyRun, combineTurns } from '../../src/runner/state.js';
import { parseTranscript, type Transcript } from '../../src/runner/stream.js';

const arms = [
  { name: 'baseline', fromRepeat: 1, toRepeat: 4 },
  { name: 'skill', fromRepeat: 1, toRepeat: 2 },
];

describe('buildRunPlan', () => {
  it('과제 × arm × 회차만큼 실행을 만든다', () => {
    const plan = buildRunPlan(['t1', 't2', 't3'], arms, 1);
    expect(plan).toHaveLength(3 * 4 + 3 * 2);
    expect(new Set(plan.map((run) => run.runId)).size).toBe(plan.length);
  });

  it('같은 시드는 같은 순서를 내고 다른 시드는 다른 순서를 낸다', () => {
    const tasks = ['t1', 't2', 't3', 't4'];
    const a = buildRunPlan(tasks, arms, 5).map((run) => run.runId);
    expect(buildRunPlan(tasks, arms, 5).map((run) => run.runId)).toEqual(a);
    expect(buildRunPlan(tasks, arms, 6).map((run) => run.runId)).not.toEqual(a);
  });

  it('회차 블록 없이 전체를 섞어 arm과 회차가 뒤섞인다', () => {
    const plan = buildRunPlan(['t1', 't2', 't3', 't4', 't5'], arms, 9);
    const repeats = plan.map((run) => run.repeat);
    expect(repeats).not.toEqual([...repeats].sort((x, y) => x - y));
    const firstTen = new Set(plan.slice(0, 10).map((run) => run.arm));
    expect(firstTen).toEqual(new Set(['baseline', 'skill']));
  });

  it('회차 범위의 중간부터 시작할 수 있다', () => {
    const plan = buildRunPlan(['t1', 't2'], [{ name: 'baseline', fromRepeat: 3, toRepeat: 4 }], 1);
    expect(plan.map((run) => run.runId).sort()).toEqual([
      't1__baseline__3',
      't1__baseline__4',
      't2__baseline__3',
      't2__baseline__4',
    ]);
  });

  it('잘못된 설정은 거부한다', () => {
    expect(() => buildRunPlan(['t1'], [{ name: 'a', fromRepeat: 0, toRepeat: 1 }], 1)).toThrow(
      RangeError,
    );
    expect(() => buildRunPlan(['t1'], [{ name: 'a', fromRepeat: 3, toRepeat: 2 }], 1)).toThrow(
      RangeError,
    );
    const one = { name: 'a', fromRepeat: 1, toRepeat: 1 };
    expect(() => buildRunPlan(['t1'], [one, one], 1)).toThrow();
    expect(() => buildRunPlan(['t1', 't1'], [one], 1)).toThrow();
  });
});

describe('executePlan', () => {
  const plan = buildRunPlan(['t1', 't2', 't3'], [{ name: 'a', fromRepeat: 1, toRepeat: 2 }], 1);

  it('동시 실행 수를 넘지 않고 결과를 계획 순서대로 돌려준다', async () => {
    let active = 0;
    let peak = 0;
    const results = await executePlan(plan, 2, async (spec) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return spec.runId;
    });
    expect(peak).toBe(2);
    expect(results.map((r) => (r.ok ? r.value : null))).toEqual(plan.map((spec) => spec.runId));
  });

  it('한 실행이 예외를 내도 나머지를 끝까지 실행한다', async () => {
    const results = await executePlan(plan, 3, (spec) =>
      spec.taskId === 't2' ? Promise.reject(new Error('boom')) : Promise.resolve(spec.runId),
    );
    expect(results.filter((r) => !r.ok)).toHaveLength(2);
    expect(results.filter((r) => r.ok)).toHaveLength(4);
  });
});

describe('classifyRun', () => {
  const transcript = (skills: string[], result: Record<string, unknown> | null): Transcript =>
    parseTranscript(
      [
        JSON.stringify({ type: 'system', subtype: 'init', skills, plugins: [], tools: [] }),
        ...(result === null ? [] : [JSON.stringify({ type: 'result', ...result })]),
      ].join('\n'),
    );
  const ok = { subtype: 'success', is_error: false };
  const control = { expectedSkill: null, targetPrefix: 'es-toolkit:' };
  const treatment = { expectedSkill: 'es-toolkit:migrate', targetPrefix: 'es-toolkit:' };
  const outcome = (t: Transcript, timedOut = false) => ({ timedOut, exitCode: 0, transcript: t });

  it('정상 종료는 completed다', () => {
    expect(classifyRun(outcome(transcript(['verify'], ok)), control)).toBe('completed');
    expect(classifyRun(outcome(transcript(['es-toolkit:migrate'], ok)), treatment)).toBe(
      'completed',
    );
  });

  it('대조 arm에 대상 Skill이 로드되면 contaminated다', () => {
    expect(classifyRun(outcome(transcript(['es-toolkit:guide'], ok)), control)).toBe(
      'contaminated',
    );
  });

  it('처리 arm에 대상 Skill이 없으면 harness다', () => {
    expect(classifyRun(outcome(transcript(['verify'], ok)), treatment)).toBe('harness');
  });

  it('시간 한도와 턴 한도는 limit다', () => {
    expect(classifyRun(outcome(transcript([], null), true), control)).toBe('limit');
    const maxTurns = { subtype: 'error_max_turns', is_error: true };
    expect(classifyRun(outcome(transcript([], maxTurns)), control)).toBe('limit');
  });

  it('결과 메시지가 없거나 오류로 끝나면 infra다', () => {
    expect(classifyRun(outcome(transcript([], null)), control)).toBe('infra');
    const apiError = { subtype: 'error_during_execution', is_error: true };
    expect(classifyRun(outcome(transcript([], apiError)), control)).toBe('infra');
    expect(classifyRun(outcome(parseTranscript('')), control)).toBe('infra');
  });
});

describe('combineTurns', () => {
  it('두 턴이 모두 정상이면 completed다', () => {
    expect(combineTurns('completed', 'completed', 0)).toBe('completed');
  });

  it('첫 턴이 한도에 걸리면 두 번째 턴 없이 limit다', () => {
    expect(combineTurns('limit', null, 0)).toBe('limit');
    expect(combineTurns('completed', 'limit', 0)).toBe('limit');
  });

  it('네트워크 접근 시도는 한도보다 우선해 contaminated다', () => {
    expect(combineTurns('completed', 'completed', 1)).toBe('contaminated');
    expect(combineTurns('limit', null, 2)).toBe('contaminated');
  });

  it('어느 턴이든 infra·harness면 다시 실행할 상태다', () => {
    expect(combineTurns('completed', 'infra', 3)).toBe('infra');
    expect(combineTurns('harness', null, 0)).toBe('harness');
    // 첫 턴이 끝났는데 두 번째 턴 기록이 없으면 하네스 결함이다.
    expect(combineTurns('completed', null, 0)).toBe('harness');
  });
});
