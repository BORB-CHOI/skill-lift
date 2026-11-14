/**
 * results/es-toolkit-migrate/<label>/<runId>/의 meta.json과 grade.json을 읽는다.
 * 채점은 하지 않는다. grade.json이 없는 completed 실행은 grade = null로 두고 호출하는 쪽이 보고한다.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  ARMS,
  RUN_STATES,
  type Arm,
  type Grade,
  type GradeItem,
  type RunMeta,
  type RunRecord,
  type RunStateName,
} from './aggregate.js';

function validateMeta(raw: unknown, file: string, runId: string): RunMeta {
  const meta = raw as Partial<RunMeta>;
  if (typeof meta.taskId !== 'string') throw new TypeError(`${file}: taskId(프로젝트)가 없다`);
  if (!ARMS.includes(meta.arm as Arm))
    throw new TypeError(`${file}: 알 수 없는 arm ${String(meta.arm)}`);
  if (!RUN_STATES.includes(meta.state as RunStateName)) {
    throw new TypeError(`${file}: 알 수 없는 state ${String(meta.state)}`);
  }
  if (typeof meta.repeat !== 'number') throw new TypeError(`${file}: repeat가 숫자가 아니다`);
  const withId = { ...meta, runId: typeof meta.runId === 'string' ? meta.runId : runId };
  // 옛 형식(turns가 숫자)은 턴 기록으로 쓸 수 없어 뺀다.
  if (meta.turns !== undefined && !Array.isArray(meta.turns)) {
    return Object.fromEntries(
      Object.entries(withId).filter(([key]) => key !== 'turns'),
    ) as unknown as RunMeta;
  }
  return withId as RunMeta;
}

function validateGrade(raw: unknown, file: string): Grade {
  const grade = raw as Partial<Grade>;
  if (!Array.isArray(grade.items) || typeof grade.score !== 'number') {
    throw new TypeError(`${file}: items, score가 없다`);
  }
  if (!(grade.score >= 0 && grade.score <= 1)) {
    throw new RangeError(`${file}: score ${grade.score}가 0..1 밖이다`);
  }
  for (const raw of grade.items as unknown[]) {
    const item = raw as Partial<GradeItem> | null;
    if (typeof item?.id !== 'string' || typeof item.pass !== 'boolean') {
      throw new TypeError(`${file}: 항목에 id(문자열)와 pass(boolean)가 있어야 한다`);
    }
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
    const meta = validateMeta(JSON.parse(readFileSync(metaFile, 'utf8')), metaFile, entry);
    const gradeFile = join(runDir, 'grade.json');
    const grade = existsSync(gradeFile)
      ? validateGrade(JSON.parse(readFileSync(gradeFile, 'utf8')), gradeFile)
      : null;
    runs.push({ meta, grade });
  }
  return runs;
}
