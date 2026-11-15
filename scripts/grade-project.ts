/**
 * 프로젝트 단위 실행을 채점해 실행 폴더마다 grade.json을 쓴다(설계 문서 5절).
 *
 * 대상은 state가 completed나 limit인 실행이다. limit 실행도 항목을 매겨 기록하되 점수는 0이다.
 * 이미 grade.json이 있으면 건너뛰고, --force를 주면 다시 채점한다.
 *
 * 사용: pnpm tsx scripts/grade-project.ts <실행 이름 또는 실행 폴더 경로> [--force] [--concurrency N]
 * 실행 이름이면 results/es-toolkit-project/<이름>을 찾는다.
 * 환경 변수: SKILL_EVAL_FIXTURES, SKILL_EVAL_FIXTURES_META(기본 ../../eval-projects/fixtures[-meta]),
 * SKILL_EVAL_GRADE_TMP(작업 폴더 위치, 기본 OS 임시 폴더).
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  defaultRoots,
  gradeProject,
  loadProjectSetup,
  type ProjectSetup,
} from '../src/graders/project.js';

interface Meta {
  runId: string;
  taskId: string;
  arm?: string;
  repeat?: number;
  state: string;
}

const args = process.argv.slice(2);
const label = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--concurrency');
if (label === undefined) throw new Error('실행 이름을 주어야 한다');
const force = args.includes('--force');
const ci = args.indexOf('--concurrency');
const concurrency = ci >= 0 ? Math.max(1, Number(args[ci + 1] ?? '1')) : 1;

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const runsDir =
  isAbsolute(label) || existsSync(label)
    ? resolve(label)
    : join(repoRoot, 'results/es-toolkit-project', label);
if (!existsSync(runsDir)) throw new Error(`실행 폴더 없음: ${runsDir}`);
const roots = defaultRoots(repoRoot);

const setups = new Map<string, ProjectSetup>();
function setupFor(project: string): ProjectSetup {
  const cached = setups.get(project);
  if (cached !== undefined) return cached;
  const s = loadProjectSetup(project, roots);
  setups.set(project, s);
  return s;
}

const queue: { dir: string; meta: Meta }[] = [];
let skipped = 0;
for (const runId of readdirSync(runsDir).sort()) {
  const dir = join(runsDir, runId);
  const metaFile = join(dir, 'meta.json');
  if (!existsSync(metaFile)) continue;
  const meta = JSON.parse(readFileSync(metaFile, 'utf8')) as Meta;
  if (meta.state !== 'completed' && meta.state !== 'limit') continue;
  if (existsSync(join(dir, 'grade.json')) && !force) {
    skipped++;
    continue;
  }
  queue.push({ dir, meta });
}
console.log(`채점 대상 ${queue.length}개, 건너뜀 ${skipped}개, 동시 ${concurrency}개`);

let done = 0;
let failed = 0;
async function worker(): Promise<void> {
  for (let job = queue.shift(); job !== undefined; job = queue.shift()) {
    const { dir, meta } = job;
    try {
      const grade = await gradeProject({
        setup: setupFor(meta.taskId),
        patchFile: join(dir, 'changes.patch'),
        zeroScore: meta.state === 'limit',
      });
      const record = {
        runId: meta.runId,
        arm: meta.arm,
        repeat: meta.repeat,
        state: meta.state,
        ...grade,
      };
      writeFileSync(join(dir, 'grade.json'), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
      done++;
      const sec = ((grade.durations.total ?? 0) / 1000).toFixed(0);
      console.log(
        `${meta.runId} ${meta.state} 점수 ${grade.score.toFixed(3)} (${grade.counts.passed}/${grade.counts.items}) ${sec}초`,
      );
    } catch (e) {
      // 채점기 자체 오류는 grade.json을 쓰지 않는다. 다시 돌리면 이어서 채점한다.
      failed++;
      console.error(`${meta.runId} 채점 오류: ${(e as Error).stack ?? String(e)}`);
    }
  }
}
await Promise.all(Array.from({ length: concurrency }, () => worker()));
console.log(`채점 ${done}개, 오류 ${failed}개, 건너뜀 ${skipped}개`);
if (failed > 0) process.exitCode = 1;
