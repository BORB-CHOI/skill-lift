import { describe, expect, it } from 'vitest';
import { buildRunPlan, executePlan } from '../../src/runner/plan.js';
import { classifyRun } from '../../src/runner/state.js';
import { parseTranscript, type Transcript } from '../../src/runner/stream.js';

const arms = [
  { name: 'baseline', repeats: 4 },
  { name: 'skill', repeats: 2 },
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

  it('회차 블록 순서를 지키고 블록 안에서만 섞는다', () => {
    const plan = buildRunPlan(['t1', 't2', 't3'], arms, 9);
    const repeats = plan.map((run) => run.repeat);
    expect(repeats).toEqual([...repeats].sort((x, y) => x - y));
    // 첫 블록에는 두 arm이 섞여 있다.
    const firstBlock = plan.filter((run) => run.repeat === 1).map((run) => run.arm);
    expect(new Set(firstBlock)).toEqual(new Set(['baseline', 'skill']));
    // 3회차부터는 반복 횟수가 많은 arm만 남는다.
    expect(plan.filter((run) => run.repeat === 3).every((run) => run.arm === 'baseline')).toBe(
      true,
    );
  });

  it('잘못된 arm 설정은 거부한다', () => {
    expect(() => buildRunPlan(['t1'], [{ name: 'a', repeats: 0 }], 1)).toThrow(RangeError);
    expect(() =>
      buildRunPlan(
        ['t1'],
        [
          { name: 'a', repeats: 1 },
          { name: 'a', repeats: 1 },
        ],
        1,
      ),
    ).toThrow();
  });
});

describe('executePlan', () => {
  const plan = buildRunPlan(['t1', 't2', 't3'], [{ name: 'a', repeats: 2 }], 1);

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
