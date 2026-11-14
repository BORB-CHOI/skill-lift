/**
 * 파일럿으로 과제를 거른다(설계 문서 4.4).
 *
 * baseline 1~2회차의 항목 점수로 목적별로 따로 거른다. 한 과제의 항목 점수 6개(항목 3개 × 2회) 평균이
 * 0.67 이하(2개 이상 오답)인 과제만 그 목적의 가설에 쓴다. 시간·턴 한도에 걸린 실행은 0점으로 넣고,
 * 인프라 실패와 오염 실행은 빼며, 1~2회차 가운데 남은 실행이 2개가 아니면 그 과제는 판정하지 않고 버린다.
 * 결과는 suites/es-toolkit/migrate/selection.json에 쓴다.
 *
 * 사용: pnpm tsx scripts/select-tasks.ts <파일럿 실행 이름>
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface Meta {
  taskId: string;
  arm: string;
  repeat: number;
  state: string;
}
interface Grade {
  items: { p1: { score: number }; p2: { score: number } }[];
}

const THRESHOLD = 4 / 6;
const [label] = process.argv.slice(2);
if (label === undefined) throw new Error('파일럿 실행 이름을 주어야 한다');
const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const runsDir = join(repoRoot, 'results/es-toolkit-migrate', label);
const tasks = readdirSync(join(repoRoot, 'suites/es-toolkit/migrate/tasks')).sort();

const scores = new Map<string, { p1: number[]; p2: number[]; runs: number }>();
for (const id of tasks) scores.set(id, { p1: [], p2: [], runs: 0 });
for (const runId of readdirSync(runsDir)) {
  const metaFile = join(runsDir, runId, 'meta.json');
  if (!existsSync(metaFile)) continue;
  const meta = JSON.parse(readFileSync(metaFile, 'utf8')) as Meta;
  if (meta.arm !== 'baseline' || meta.repeat > 2) continue;
  const entry = scores.get(meta.taskId);
  if (entry === undefined) continue;
  if (meta.state === 'limit') {
    entry.p1.push(0, 0, 0);
    entry.p2.push(0, 0, 0);
    entry.runs++;
  } else if (meta.state === 'completed') {
    const gradeFile = join(runsDir, runId, 'grade.json');
    if (!existsSync(gradeFile))
      throw new Error(`${runId}: grade.json이 없다. grade-runs를 먼저 돌려야 한다`);
    const grade = JSON.parse(readFileSync(gradeFile, 'utf8')) as Grade;
    for (const item of grade.items) {
      entry.p1.push(item.p1.score);
      entry.p2.push(item.p2.score);
    }
    entry.runs++;
  }
}

const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
const kept = { p1: [] as string[], p2: [] as string[] };
const records: Record<
  string,
  {
    runs: number;
    p1: number | null;
    p2: number | null;
    p1Kept: boolean;
    p2Kept: boolean;
    reason: string;
  }
> = {};
for (const [id, s] of scores) {
  if (s.runs !== 2) {
    records[id] = {
      runs: s.runs,
      p1: null,
      p2: null,
      p1Kept: false,
      p2Kept: false,
      reason: `1~2회차 유효 실행이 ${s.runs}개`,
    };
    continue;
  }
  const p1 = mean(s.p1);
  const p2 = mean(s.p2);
  const p1Kept = p1 <= THRESHOLD + 1e-9;
  const p2Kept = p2 <= THRESHOLD + 1e-9;
  if (p1Kept) kept.p1.push(id);
  if (p2Kept) kept.p2.push(id);
  const reason = [
    p1Kept ? null : `목적 1 baseline 평균 ${p1.toFixed(2)} > 0.67`,
    p2Kept ? null : `목적 2 baseline 평균 ${p2.toFixed(2)} > 0.67`,
  ]
    .filter(Boolean)
    .join(', ');
  records[id] = { runs: s.runs, p1, p2, p1Kept, p2Kept, reason };
  console.log(
    id,
    `목적1 ${p1.toFixed(2)}${p1Kept ? ' 남김' : ''}`,
    `목적2 ${p2.toFixed(2)}${p2Kept ? ' 남김' : ''}`,
  );
}
const out = join(repoRoot, 'suites/es-toolkit/migrate/selection.json');
writeFileSync(
  out,
  `${JSON.stringify({ pilot: label, threshold: '항목 점수 6개 평균 ≤ 0.67', tasks: kept, records }, null, 2)}\n`,
  'utf8',
);
console.log(`목적 1 과제 ${kept.p1.length}개, 목적 2 과제 ${kept.p2.length}개`);
