/**
 * 실행 계획과 동시 실행.
 *
 * 모든 (과제, arm, 회차) 실행을 한 목록에 넣고 시드 고정 난수로 통째로 섞는다(설계 3절).
 * 한 arm을 몰아서 실행하면 시간대에 따른 변화(서비스 상태, 사용 한도)가 arm의 차이로 보일 수 있다.
 * 시드를 기록해 같은 계획을 다시 만들 수 있게 한다.
 */
import { mulberry32 } from '../stats/paired.js';

export interface ArmPlan {
  readonly name: string;
  /** 실행할 회차의 범위. 양 끝을 포함하고 1부터 센다. 파일럿 3~4회차처럼 중간부터 시작할 수 있다. */
  readonly fromRepeat: number;
  readonly toRepeat: number;
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
  if (new Set(taskIds).size !== taskIds.length) throw new Error('과제 ID가 겹친다');
  for (const arm of arms) {
    const { fromRepeat, toRepeat } = arm;
    if (
      !Number.isInteger(fromRepeat) ||
      !Number.isInteger(toRepeat) ||
      fromRepeat < 1 ||
      toRepeat < fromRepeat
    ) {
      throw new RangeError(
        `arm ${arm.name}: 회차 범위는 1 이상의 정수이고 시작이 끝보다 크지 않아야 한다`,
      );
    }
  }
  const jobs: RunSpec[] = [];
  for (const taskId of taskIds) {
    for (const arm of arms) {
      for (let repeat = arm.fromRepeat; repeat <= arm.toRepeat; repeat++) {
        jobs.push({ runId: `${taskId}__${arm.name}__${repeat}`, taskId, arm: arm.name, repeat });
      }
    }
  }
  return shuffle(jobs, mulberry32(seed));
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
