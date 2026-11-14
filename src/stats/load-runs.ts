/**
 * results/es-toolkit-migrate/<label>/<runId>/의 meta.json과 grade.json을 읽는다.
 * 채점은 하지 않는다. grade.json이 없는 completed 실행은 grade = null로 두고 호출하는 쪽이 보고한다.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Arm, Grade, RunMeta, RunRecord, RunStateName } from './aggregate.js';

const ARMS: readonly Arm[] = ['baseline', 'skill', 'placebo'];
const STATES: readonly RunStateName[] = ['completed', 'limit', 'infra', 'contaminated', 'harness'];

function validateMeta(raw: unknown, file: string): RunMeta {
  const meta = raw as Partial<RunMeta>;
  if (typeof meta.runId !== 'string' || typeof meta.taskId !== 'string') {
    throw new TypeError(`${file}: runId, taskId가 없다`);
  }
  if (!ARMS.includes(meta.arm as Arm))
    throw new TypeError(`${file}: 알 수 없는 arm ${String(meta.arm)}`);
  if (!STATES.includes(meta.state as RunStateName)) {
    throw new TypeError(`${file}: 알 수 없는 state ${String(meta.state)}`);
  }
  if (typeof meta.repeat !== 'number') throw new TypeError(`${file}: repeat가 숫자가 아니다`);
  // 옛 형식(turns가 숫자)은 턴 기록으로 쓸 수 없어 뺀다.
  if (meta.turns !== undefined && !Array.isArray(meta.turns)) {
    return { ...meta, turns: undefined } as unknown as RunMeta;
  }
  return meta as RunMeta;
}

function validateGrade(raw: unknown, file: string): Grade {
  const grade = raw as Partial<Grade>;
  if (!Array.isArray(grade.items) || typeof grade.p1 !== 'number' || typeof grade.p2 !== 'number') {
    throw new TypeError(`${file}: items, p1, p2가 없다`);
  }
  return grade as Grade;
}

export function loadRuns(labelDir: string): RunRecord[] {
  if (!existsSync(labelDir)) throw new Error(`결과 폴더가 없다: ${labelDir}`);
  const runs: RunRecord[] = [];
  for (const entry of readdirSync(labelDir).sort()) {
    const runDir = join(labelDir, entry);
    if (!statSync(runDir).isDirectory()) continue;
    const metaFile = join(runDir, 'meta.json');
    if (!existsSync(metaFile)) continue;
    const meta = validateMeta(JSON.parse(readFileSync(metaFile, 'utf8')), metaFile);
    const gradeFile = join(runDir, 'grade.json');
    const grade = existsSync(gradeFile)
      ? validateGrade(JSON.parse(readFileSync(gradeFile, 'utf8')), gradeFile)
      : null;
    runs.push({ meta, grade });
  }
  return runs;
}

/**
 * 과제별 실행의 항목 점수 배열. 목적 하나, 조건 하나만 고른다.
 * limit 실행은 그 과제의 항목 수만큼 0을 넣는다(다른 실행에서 항목 수를 알 수 없으면 3개).
 * 점수를 쓸 수 없는 실행(grade 없음, contaminated, infra, harness)은 뺀다.
 */
export function itemRunsByTask(
  runs: readonly RunRecord[],
  taskIds: readonly string[],
  arm: Arm,
  purpose: 'p1' | 'p2',
  repeatFilter: (repeat: number) => boolean = () => true,
): number[][][] {
  return taskIds.map((taskId) => {
    const own = runs.filter(
      (r) => r.meta.taskId === taskId && r.meta.arm === arm && repeatFilter(r.meta.repeat),
    );
    const itemCount = own.find((r) => r.grade !== null)?.grade?.items.length ?? 3;
    const out: number[][] = [];
    for (const run of [...own].sort((a, b) => a.meta.repeat - b.meta.repeat)) {
      if (run.meta.state === 'limit') out.push(new Array<number>(itemCount).fill(0));
      else if (run.meta.state === 'completed' && run.grade !== null) {
        out.push(run.grade.items.map((item) => item[purpose].score));
      }
    }
    return out;
  });
}
