/**
 * 실행 계획과 동시 실행.
 *
 * 실행 순서는 반복 회차 단위의 블록 안에서 무작위로 섞는다. 한 arm을 몰아서 실행하면
 * 시간대에 따른 변화(서비스 상태, 사용 한도)가 arm의 차이로 보일 수 있다.
 * 시드를 기록해 같은 계획을 다시 만들 수 있게 한다.
 */
import { mulberry32 } from '../stats/paired.js';

export interface ArmPlan {
  readonly name: string;
  /** 과제당 실행 횟수. */
  readonly repeats: number;
}

export interface RunSpec {
  /** `<과제>__<arm>__<회차>` 형식. 결과 폴더 이름으로 쓴다. */
  readonly runId: string;
  readonly taskId: string;
  readonly arm: string;
  /** 1부터 시작하는 회차. */
  readonly repeat: number;
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = out[i];
    const b = out[j];
    if (a !== undefined && b !== undefined) {
      out[i] = b;
      out[j] = a;
    }
  }
  return out;
}

export function buildRunPlan(
  taskIds: readonly string[],
  arms: readonly ArmPlan[],
  seed: number,
): RunSpec[] {
  const names = new Set(arms.map((arm) => arm.name));
  if (names.size !== arms.length) throw new Error('arm 이름이 겹친다');
  for (const arm of arms) {
    if (!Number.isInteger(arm.repeats) || arm.repeats < 1) {
      throw new RangeError(`arm ${arm.name}: 실행 횟수는 1 이상의 정수여야 한다`);
    }
  }
  const random = mulberry32(seed);
  const maxRepeats = Math.max(0, ...arms.map((arm) => arm.repeats));
  const plan: RunSpec[] = [];
  for (let repeat = 1; repeat <= maxRepeats; repeat++) {
    const block: RunSpec[] = [];
    for (const taskId of taskIds) {
      for (const arm of arms) {
        if (arm.repeats < repeat) continue;
        block.push({ runId: `${taskId}__${arm.name}__${repeat}`, taskId, arm: arm.name, repeat });
      }
    }
    plan.push(...shuffle(block, random));
  }
  return plan;
}

/**
 * 계획의 실행을 동시 실행 수 한도 안에서 돌린다. 결과는 계획과 같은 순서로 돌려준다.
 * 한 실행이 예외를 내도 나머지는 계속하고, 예외는 그 자리의 결과로 남긴다.
 */
export async function executePlan<T>(
  plan: readonly RunSpec[],
  concurrency: number,
  runOne: (spec: RunSpec) => Promise<T>,
): Promise<({ ok: true; value: T } | { ok: false; error: unknown })[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError('동시 실행 수는 1 이상의 정수여야 한다');
  }
  const results = new Array<{ ok: true; value: T } | { ok: false; error: unknown }>(plan.length);
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const index = next++;
      const spec = plan[index];
      if (spec === undefined) return;
      try {
        results[index] = { ok: true, value: await runOne(spec) };
      } catch (error) {
        results[index] = { ok: false, error };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, plan.length) }, () => worker()));
  return results;
}
