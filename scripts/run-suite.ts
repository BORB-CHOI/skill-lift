/**
 * migrate 과제의 에이전트 실행. 두 턴의 실행 기록과 산출물만 저장한다. 채점은 따로 한다.
 *
 * 사용:
 *   pnpm tsx scripts/run-suite.ts --label <이름> --mode <full|pilot|smoke> --repeats <K | a-b>
 *     --max-turns <N> --timeout-min <분> [--tasks t1,t2] [--arms baseline,skill,placebo]
 *     [--model claude-sonnet-5-5] [--concurrency 4] [--seed 20261114]
 *
 *   full   세 arm 전부. --arms로 줄일 수 있다.
 *   pilot  baseline만. 설계 4.4의 거르기(1-2)와 추정(3-4)을 --repeats로 나눠 돌린다.
 *   smoke  --tasks와 --arms를 반드시 준다. 설계 4.5의 한도 설정용 실행이다.
 *
 * 턴 한도와 시간 한도는 턴 하나에 적용한다. 기본값이 없다. 인자나 환경 변수
 * (SKILL_EVAL_MAX_TURNS, SKILL_EVAL_TIMEOUT_MIN)로 반드시 준다.
 *
 * 출력: results/es-toolkit-migrate/<이름>/<runId>/
 *   transcript-1.jsonl, transcript-2.jsonl, submission.ts, report.json, meta.json
 *
 * 같은 이름으로 다시 돌리면 끝난 실행(completed, limit, contaminated)은 건너뛴다.
 * 인프라·하네스 실패만 다시 실행한다.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { networkBlockEnv } from '../src/runner/claude.js';
import { buildRunPlan, executePlan, type ArmPlan, type RunSpec } from '../src/runner/plan.js';
import { SKILL_PREFIX } from '../src/runner/prompts.js';
import { runTwoTurns } from '../src/runner/session.js';
import type { RunState } from '../src/runner/state.js';
import { prepareWorkspace, verifyDeps } from '../src/runner/workspace.js';

const { values: opts } = parseArgs({
  options: {
    label: { type: 'string' },
    mode: { type: 'string', default: 'full' },
    repeats: { type: 'string' },
    tasks: { type: 'string' },
    arms: { type: 'string' },
    model: { type: 'string', default: 'claude-sonnet-5-5' },
    concurrency: { type: 'string', default: '4' },
    seed: { type: 'string', default: '20261114' },
    'max-turns': { type: 'string' },
    'timeout-min': { type: 'string' },
  },
  strict: true,
});

function positiveInt(value: string | undefined, name: string): number {
  const n = Number(value);
  if (value === undefined || !Number.isInteger(n) || n < 1) {
    throw new Error(`${name}는 1 이상의 정수여야 한다 (받은 값: ${String(value)})`);
  }
  return n;
}

/** "3"은 1~3, "3-4"는 3~4. */
function repeatRange(value: string | undefined): { fromRepeat: number; toRepeat: number } {
  if (value === undefined) throw new Error('--repeats를 지정해야 한다 (예: 4 또는 3-4)');
  const [a, b] = value.split('-');
  return b === undefined
    ? { fromRepeat: 1, toRepeat: positiveInt(a, '--repeats') }
    : { fromRepeat: positiveInt(a, '--repeats 시작'), toRepeat: positiveInt(b, '--repeats 끝') };
}

const list = (value: string | undefined): string[] | undefined =>
  value
    ?.split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');

const label = opts.label ?? '';
if (label === '') throw new Error('--label을 지정해야 한다');
const mode = opts.mode;
const model = opts.model;
const concurrency = positiveInt(opts.concurrency, '--concurrency');
const seed = positiveInt(opts.seed, '--seed');
const maxTurns = positiveInt(
  opts['max-turns'] ?? process.env['SKILL_EVAL_MAX_TURNS'],
  '--max-turns',
);
const timeoutMin = Number(opts['timeout-min'] ?? process.env['SKILL_EVAL_TIMEOUT_MIN']);
if (!(timeoutMin > 0)) throw new Error('--timeout-min(분)을 지정해야 한다');
const timeoutMs = Math.round(timeoutMin * 60_000);
const range = repeatRange(opts.repeats);

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const tasksRoot =
  process.env['SKILL_EVAL_TASKS'] ?? join(repoRoot, 'suites/es-toolkit/migrate/tasks');
const pilotDir = join(repoRoot, '.pilot');
/** 작업 폴더에 복사할 의존성. lodash를 포함한 폴더여야 한다(verifyDeps가 확인). */
const depsNodeModules = process.env['SKILL_EVAL_DEPS'] ?? join(pilotDir, 'deps/node_modules');
const emptyMcpConfig = join(pilotDir, 'empty-mcp.json');
const outRoot = join(repoRoot, 'results/es-toolkit-migrate', label);

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 90_000;
const TARGET_PREFIX = 'es-toolkit:';

interface Arm {
  readonly name: string;
  readonly pluginDir: string | null;
  readonly prefix: string;
  readonly expectedSkill: string | null;
}

/** 설계 3절의 세 조건. 플러그인 폴더는 scripts/prepare-arms.ts가 만든다. */
const ARMS: readonly Arm[] = [
  { name: 'baseline', pluginDir: null, prefix: '', expectedSkill: null },
  {
    name: 'skill',
    pluginDir: join(repoRoot, '.arms/skill'),
    prefix: SKILL_PREFIX,
    expectedSkill: 'es-toolkit:migrate',
  },
  {
    name: 'placebo',
    pluginDir: join(repoRoot, '.arms/placebo'),
    prefix: SKILL_PREFIX,
    expectedSkill: 'es-toolkit:migrate',
  },
];

function selectArms(): Arm[] {
  const requested = list(opts.arms);
  if (mode === 'pilot') {
    if (requested !== undefined && requested.join() !== 'baseline')
      throw new Error('pilot은 baseline만 실행한다');
    return ARMS.filter((a) => a.name === 'baseline');
  }
  if (mode === 'smoke' && requested === undefined)
    throw new Error('smoke는 --arms를 지정해야 한다');
  if (mode !== 'full' && mode !== 'smoke') throw new Error(`알 수 없는 모드: ${mode}`);
  if (requested === undefined) return [...ARMS];
  return requested.map((name) => {
    const arm = ARMS.find((a) => a.name === name);
    if (arm === undefined) throw new Error(`알 수 없는 arm: ${name}`);
    return arm;
  });
}

function selectTasks(): string[] {
  const requested = list(opts.tasks);
  if (mode === 'smoke' && requested === undefined)
    throw new Error('smoke는 --tasks를 지정해야 한다');
  const ids =
    requested ??
    readdirSync(tasksRoot).filter((id) => existsSync(join(tasksRoot, id, 'src/module.ts')));
  for (const id of ids) {
    if (!existsSync(join(tasksRoot, id, 'src/module.ts')))
      throw new Error(`${id}: src/module.ts가 없다`);
  }
  return ids.sort();
}

const arms = selectArms();
const taskIds = selectTasks();
for (const arm of arms) {
  if (arm.pluginDir !== null && !existsSync(join(arm.pluginDir, 'skills/migrate/SKILL.md'))) {
    throw new Error(`${arm.pluginDir}가 없다. pnpm eval:prepare-arms를 먼저 실행한다`);
  }
}
const versions = verifyDeps(depsNodeModules);
const env = networkBlockEnv();

const armPlans: ArmPlan[] = arms.map(({ name }) => ({ name, ...range }));
const plan = buildRunPlan(taskIds, armPlans, seed);
mkdirSync(outRoot, { recursive: true });
writeFileSync(
  join(outRoot, `plan-${mode}-${String(range.fromRepeat)}-${String(range.toRepeat)}.json`),
  `${JSON.stringify({ label, mode, model, concurrency, seed, maxTurns, timeoutMs, tasksRoot, depsNodeModules, versions, env, taskIds, arms, repeats: range, plan }, null, 2)}\n`,
  'utf8',
);

function isDone(runDir: string): boolean {
  const metaFile = join(runDir, 'meta.json');
  if (!existsSync(metaFile)) return false;
  const state = (JSON.parse(readFileSync(metaFile, 'utf8')) as { state: RunState }).state;
  return state === 'completed' || state === 'limit' || state === 'contaminated';
}

async function attemptOnce(
  spec: RunSpec,
  arm: Arm,
  runDir: string,
  attempt: number,
): Promise<RunState> {
  // 지난 시도의 산출물이 남지 않게 실행 폴더를 비운다.
  rmSync(runDir, { recursive: true, force: true });
  mkdirSync(runDir, { recursive: true });
  const workspace = prepareWorkspace(join(tasksRoot, spec.taskId), depsNodeModules, versions);
  try {
    const result = await runTwoTurns({
      command: 'claude',
      workspace,
      runDir,
      prefix: arm.prefix,
      config: { model, maxTurns, emptyMcpConfig, pluginDir: arm.pluginDir },
      expectation: { expectedSkill: arm.expectedSkill, targetPrefix: TARGET_PREFIX },
      timeoutMs,
      env,
    });
    result.transcripts.forEach((text, i) => {
      writeFileSync(join(runDir, `transcript-${String(i + 1)}.jsonl`), text, 'utf8');
    });
    const meta = {
      ...spec,
      state: result.state,
      attempt,
      model: result.model,
      requestedModel: model,
      claudeVersion: result.claudeVersion,
      sessionId: result.sessionId,
      submission: result.submission ? 'submission.ts' : null,
      report: result.report ? 'report.json' : null,
      loadedSkills: result.loadedSkills,
      ...result.checks,
      networkAttempts: result.networkAttempts,
      limits: { maxTurns, timeoutMs },
      turns: result.turns,
    };
    writeFileSync(join(runDir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
    return result.state;
  } finally {
    rmSync(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }
}

async function runOne(spec: RunSpec): Promise<RunState | 'skipped'> {
  const runDir = join(outRoot, spec.runId);
  if (isDone(runDir)) return 'skipped';
  const arm = arms.find((a) => a.name === spec.arm);
  if (arm === undefined) throw new Error(`알 수 없는 arm: ${spec.arm}`);

  let state: RunState = 'infra';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    state = await attemptOnce(spec, arm, runDir, attempt);
    // 인프라와 하네스의 실패만 다시 실행한다. 두 턴을 처음부터 다시 돌린다.
    if (state !== 'infra' && state !== 'harness') break;
    // 일시 차단(예: 인증 요청의 403)은 몇 분 이어진다. 바로 다시 시도하면 같은 구간에서 또 실패한다.
    if (attempt < MAX_ATTEMPTS)
      await new Promise((resolve) => setTimeout(resolve, attempt * RETRY_DELAY_MS));
  }
  console.log(`${spec.runId}  ${state}`);
  return state;
}

console.log(
  `${mode}: 과제 ${String(taskIds.length)}개, arm ${arms.map((a) => a.name).join('/')}, 회차 ${String(range.fromRepeat)}-${String(range.toRepeat)}, 실행 ${String(plan.length)}회, 모델 ${model}, 턴당 ${String(maxTurns)}턴·${String(timeoutMin)}분, 동시 ${String(concurrency)}개`,
);
const results = await executePlan(plan, concurrency, runOne);
const counts: Record<string, number> = {};
for (const r of results) {
  const key = r.ok ? r.value : 'exception';
  counts[key] = (counts[key] ?? 0) + 1;
}
console.log(`끝: ${JSON.stringify(counts)}`);
for (const r of results) if (!r.ok) console.log(`예외: ${String(r.error)}`);
