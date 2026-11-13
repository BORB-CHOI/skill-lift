/**
 * migrate 과제의 본 실행. 에이전트를 실행해 실행 기록과 산출물만 저장한다. 채점은 rescore.ts가 한다.
 *
 * 사용: pnpm tsx scripts/run-suite.ts <실행 이름> <모델> <K> <동시 실행 수> [과제 수]
 * 출력: results/es-toolkit-migrate/<실행 이름>/<runId>/{transcript.jsonl, submission.ts, meta.json}
 *
 * 같은 실행 이름으로 다시 돌리면 끝난 실행은 건너뛴다. 인프라·하네스 실패는 다시 실행한다.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildArgs, runProcess } from '../src/runner/claude.js';
import { buildRunPlan, executePlan, type RunSpec } from '../src/runner/plan.js';
import { classifyRun, type RunState } from '../src/runner/state.js';
import { parseTranscript } from '../src/runner/stream.js';
import { buildTaskPrompt, collectSubmission, prepareWorkspace } from '../src/runner/workspace.js';
import { loadMigrateTask } from '../src/tasks/spec.js';

const [label = '', model = 'haiku', kArg = '3', concurrencyArg = '4', limitArg] =
  process.argv.slice(2);
if (label === '') throw new Error('실행 이름을 지정해야 한다');
const K = Number(kArg);
const concurrency = Number(concurrencyArg);

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const publicRoot = join(repoRoot, 'suites/es-toolkit/migrate/tasks');
const sealedRoot = join(repoRoot, 'sealed/es-toolkit/migrate');
const pilotDir = join(repoRoot, '.pilot');
const outRoot = join(repoRoot, 'results/es-toolkit-migrate', label);

const PLAN_SEED = 20261113;
const MAX_TURNS = 40;
const TIMEOUT_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 90_000;
const TARGET_PREFIX = 'es-toolkit:';

interface Arm {
  readonly name: string;
  readonly repeats: number;
  readonly pluginDir: string | null;
  readonly prefix: string;
  readonly expectedSkill: string | null;
}

// 대조 arm은 과제당 2K회 실행한다. 앞의 K회는 주 비교에, 2K회 전부는 분석 절차의 검증에 쓴다.
const arms: readonly Arm[] = [
  { name: 'baseline', repeats: 2 * K, pluginDir: null, prefix: '', expectedSkill: null },
  {
    name: 'skill',
    repeats: K,
    pluginDir: join(pilotDir, 'plugin-migrate'),
    prefix: '/es-toolkit:migrate ',
    expectedSkill: 'es-toolkit:migrate',
  },
];

interface Validation {
  readonly id: string;
  readonly accepted: boolean;
}
const validation = JSON.parse(
  readFileSync(join(sealedRoot, 'validation.json'), 'utf8'),
) as Validation[];
const taskIds = validation
  .filter((v) => v.accepted)
  .map((v) => v.id)
  .slice(0, limitArg === undefined ? undefined : Number(limitArg));

const plan = buildRunPlan(
  taskIds,
  arms.map(({ name, repeats }) => ({ name, repeats })),
  PLAN_SEED,
);
mkdirSync(outRoot, { recursive: true });
writeFileSync(
  join(outRoot, 'plan.json'),
  `${JSON.stringify({ label, model, K, concurrency, seed: PLAN_SEED, maxTurns: MAX_TURNS, timeoutMs: TIMEOUT_MS, taskIds, arms, plan }, null, 2)}\n`,
  'utf8',
);

function isDone(runDir: string): boolean {
  const metaFile = join(runDir, 'meta.json');
  if (!existsSync(metaFile)) return false;
  const state = (JSON.parse(readFileSync(metaFile, 'utf8')) as { state: RunState }).state;
  return state === 'completed' || state === 'limit' || state === 'contaminated';
}

async function runOne(spec: RunSpec): Promise<RunState | 'skipped'> {
  const runDir = join(outRoot, spec.runId);
  if (isDone(runDir)) return 'skipped';
  const arm = arms.find((a) => a.name === spec.arm);
  if (arm === undefined) throw new Error(`알 수 없는 arm: ${spec.arm}`);
  const taskDir = join(publicRoot, spec.taskId);
  const { task, source } = loadMigrateTask(taskDir, join(sealedRoot, `${spec.taskId}.json`));
  const prompt = arm.prefix + buildTaskPrompt(task.file, task.inputRange, task.exports);

  let state: RunState = 'infra';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const workspace = prepareWorkspace(taskDir, join(pilotDir, 'deps/node_modules'));
    try {
      const run = await runProcess({
        command: 'claude',
        args: buildArgs({
          model,
          maxTurns: MAX_TURNS,
          emptyMcpConfig: join(pilotDir, 'empty-mcp.json'),
          pluginDir: arm.pluginDir,
        }),
        cwd: workspace,
        prompt,
        timeoutMs: TIMEOUT_MS,
      });
      const transcript = parseTranscript(run.stdout);
      state = classifyRun(
        { timedOut: run.timedOut, exitCode: run.exitCode, transcript },
        { expectedSkill: arm.expectedSkill, targetPrefix: TARGET_PREFIX },
      );
      const submission = collectSubmission(workspace, task.file, source);
      mkdirSync(runDir, { recursive: true });
      writeFileSync(join(runDir, 'transcript.jsonl'), run.stdout, 'utf8');
      writeFileSync(join(runDir, 'submission.ts'), submission.code, 'utf8');
      writeFileSync(
        join(runDir, 'meta.json'),
        `${JSON.stringify(
          {
            ...spec,
            state,
            attempt,
            submissionKind: submission.kind,
            model: transcript.init?.model ?? null,
            loadedSkills: transcript.init?.skills.filter((s) => s.startsWith(TARGET_PREFIX)) ?? [],
            turns: transcript.result?.numTurns ?? null,
            durationMs: run.durationMs,
            usage: transcript.result?.usage ?? null,
            deniedTools: transcript.result?.deniedTools.length ?? null,
            malformedLines: transcript.malformedLines,
          },
          null,
          2,
        )}\n`,
        'utf8',
      );
    } finally {
      rmSync(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    }
    // 인프라와 하네스의 실패만 다시 실행한다. 모델 쪽 결과(completed, limit)는 그대로 둔다.
    if (state !== 'infra' && state !== 'harness') break;
    // 일시 차단(예: 인증 요청의 403)은 몇 분 이어진다. 바로 다시 시도하면 같은 구간에서 또 실패한다.
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, attempt * RETRY_DELAY_MS));
    }
  }
  console.log(`${spec.runId}  ${state}`);
  return state;
}

console.log(
  `과제 ${taskIds.length}개, 실행 ${plan.length}회, 모델 ${model}, K=${K}, 동시 ${concurrency}개`,
);
const results = await executePlan(plan, concurrency, runOne);
const counts: Record<string, number> = {};
for (const r of results) {
  const key = r.ok ? r.value : 'exception';
  counts[key] = (counts[key] ?? 0) + 1;
}
console.log(`끝: ${JSON.stringify(counts)}`);
for (const r of results) if (!r.ok) console.log(`예외: ${String(r.error)}`);
