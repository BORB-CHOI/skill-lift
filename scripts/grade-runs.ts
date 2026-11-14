/**
 * 실행 결과를 채점해 실행 폴더마다 grade.json을 쓴다(설계 문서 6절).
 *
 * 정상 종료(completed) 실행만 채점한다. 첫 턴 산출물(submission.ts)이 없으면 두 목적 모두 0점이다.
 * 보고서(report.json)가 없거나 깨졌으면 채점기가 목적 2를 0점으로 매긴다.
 * 이미 grade.json이 있는 실행은 건너뛴다. --force를 주면 다시 채점한다.
 *
 * 사용: SKILL_EVAL_SEALED=<비공개 폴더> pnpm tsx scripts/grade-runs.ts <실행 이름> [--force]
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gradeRun, readSealedSeed, type RunGrade } from '../src/graders/purpose.js';

interface Meta {
  runId: string;
  taskId: string;
  state: string;
}
interface TaskItem {
  fn: string;
  name: string;
  type: 'S' | 'D' | 'C';
}

const [label, flag] = process.argv.slice(2);
if (label === undefined) throw new Error('실행 이름을 주어야 한다');
const force = flag === '--force';
const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const runsDir = join(repoRoot, 'results/es-toolkit-migrate', label);
const tasksDir = process.env.SKILL_EVAL_TASKS ?? join(repoRoot, 'suites/es-toolkit/migrate/tasks');
const seed = readSealedSeed();

function zeroGrade(items: TaskItem[]): RunGrade {
  return {
    items: items.map((i) => ({
      name: i.name,
      fn: i.fn,
      type: i.type,
      p1: { typecheck: false, behaviour: false, entry: 'none', entryOk: false, score: 0 },
      p2: { present: false, claimed: null, counterexampleValid: null, score: 0 },
      reclassify: false,
    })),
    p1: 0,
    p2: 0,
    behaviourOnly: 0,
    bundleBytes: null,
  };
}

let graded = 0;
let skipped = 0;
for (const runId of readdirSync(runsDir).sort()) {
  const dir = join(runsDir, runId);
  const metaFile = join(dir, 'meta.json');
  if (!existsSync(metaFile)) continue;
  const meta = JSON.parse(readFileSync(metaFile, 'utf8')) as Meta;
  if (meta.state !== 'completed') continue;
  const out = join(dir, 'grade.json');
  if (existsSync(out) && !force) {
    skipped++;
    continue;
  }
  const taskDir = join(tasksDir, meta.taskId);
  const items = (
    JSON.parse(readFileSync(join(taskDir, 'task.json'), 'utf8')) as { items: TaskItem[] }
  ).items;
  const submissionFile = join(dir, 'submission.ts');
  const grade = existsSync(submissionFile)
    ? await gradeRun({ taskDir, submissionFile, reportFile: join(dir, 'report.json'), seed })
    : zeroGrade(items);
  writeFileSync(out, `${JSON.stringify(grade, null, 2)}\n`, 'utf8');
  graded++;
  console.log(runId, `목적1 ${grade.p1.toFixed(2)}`, `목적2 ${grade.p2.toFixed(2)}`);
}
console.log(`채점 ${graded}개, 건너뜀 ${skipped}개`);
