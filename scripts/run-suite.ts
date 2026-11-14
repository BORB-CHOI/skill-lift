/**
 * 프로젝트 전환 과제(lodash → es-toolkit)의 에이전트 실행. 실행 기록과 변경 패치만 저장한다.
 * 채점은 따로 한다(패치를 새 고정 사본에 적용해 테스트를 돌린다).
 *
 * 사용:
 *   pnpm tsx scripts/run-suite.ts --label <이름> --mode <full|smoke> --repeats <K | a-b>
 *     --max-turns <N> --timeout-min <분> [--projects recharts,swagger-typescript-api]
 *     [--arms baseline,skill,placebo] [--model claude-sonnet-5-5|claude-haiku-5-5]
 *     [--concurrency 4] [--seed 20261114] [--fixtures D:\Develop\eval-projects\fixtures]
 *     [--workspace-root <임시 폴더 위치>]
 *
 *   full   세 arm 전부. --arms로 줄일 수 있다.
 *   smoke  --projects와 --arms를 반드시 준다. 한도 설정과 파이프라인 확인용이다.
 *
 * 턴 한도와 시간 한도는 기본값이 없다. 인자나 환경 변수
 * (SKILL_EVAL_MAX_TURNS, SKILL_EVAL_TIMEOUT_MIN)로 반드시 준다.
 *
 * 실행 하나: 고정 사본을 임시 폴더로 복사 → claude 한 턴 → base 대비 변경을 changes.patch로 저장 → 임시 폴더 삭제.
 * 출력: results/es-toolkit-migrate-project/<이름>/<runId>/
 *   transcript.jsonl, stderr.txt, changes.patch, meta.json
 *
 * 같은 이름으로 다시 돌리면 끝난 실행(completed, limit, contaminated)은 건너뛴다.
 * 인프라·하네스 실패만 다시 실행한다.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { networkBlockEnv } from '../src/runner/claude.js';
import { buildRunPlan, executePlan, type ArmPlan, type RunSpec } from '../src/runner/plan.js';
import { PROJECT_PROMPT, SKILL_PREFIX } from '../src/runner/prompts.js';
import { runProjectSession } from '../src/runner/session.js';
import type { RunState } from '../src/runner/state.js';
import {
  BASE_TAG,
  nodeModulesFingerprint,
  prepareProjectWorkspace,
  removeTree,
  saveChanges,
} from '../src/runner/workspace.js';

const { values: opts } = parseArgs({
  options: {
    label: { type: 'string' },
    mode: { type: 'string', default: 'full' },
    repeats: { type: 'string' },
    projects: { type: 'string' },
    arms: { type: 'string' },
    model: { type: 'string', default: 'claude-sonnet-5-5' },
    concurrency: { type: 'string', default: '4' },
    seed: { type: 'string', default: '20261114' },
    fixtures: { type: 'string', default: 'D:\\Develop\\eval-projects\\fixtures' },
    'workspace-root': { type: 'string' },
    'max-turns': { type: 'string' },
    'timeout-min': { type: 'string' },
  },
  strict: true,
});

/** 평가에 쓰는 프로젝트. 고정 사본은 scripts/prepare-fixtures.ts가 만든다. */
const PROJECTS = ['recharts', 'swagger-typescript-api'] as const;
const MODELS = ['claude-sonnet-5-5', 'claude-haiku-5-5'] as const;

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
if (mode !== 'full' && mode !== 'smoke') throw new Error(`알 수 없는 모드: ${mode}`);
const model = opts.model;
if (!(MODELS as readonly string[]).includes(model)) {
  throw new Error(`--model은 ${MODELS.join(', ')} 가운데 하나여야 한다 (받은 값: ${model})`);
}
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
const fixturesRoot = opts.fixtures;
/** 작업 폴더를 만들 위치. 저장소 밖이어야 한다. */
const workspaceRoot =
  opts['workspace-root'] ?? process.env['SKILL_EVAL_WORKSPACE_ROOT'] ?? tmpdir();
const emptyMcpConfig = join(repoRoot, '.pilot/empty-mcp.json');
const outRoot = join(repoRoot, 'results/es-toolkit-migrate-project', label);

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 90_000;
const TARGET_PREFIX = 'es-toolkit:';

interface Arm {
  readonly name: string;
  readonly pluginDir: string | null;
  readonly prefix: string;
  readonly expectedSkill: string | null;
}

/** 세 조건. 플러그인 폴더는 scripts/prepare-arms.ts가 만든다. */
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
  if (mode === 'smoke' && requested === undefined)
    throw new Error('smoke는 --arms를 지정해야 한다');
  if (requested === undefined) return [...ARMS];
  return requested.map((name) => {
    const arm = ARMS.find((a) => a.name === name);
    if (arm === undefined) throw new Error(`알 수 없는 arm: ${name}`);
    return arm;
  });
}

interface Fixture {
  readonly name: string;
  readonly dir: string;
  /** 고정 사본의 base 태그가 가리키는 커밋. 메타의 값과 같아야 한다. */
  readonly baseCommit: string;
  readonly upstreamBaseSha: string;
}

/** 고정 사본과 그 메타(<fixtures>/../fixtures-meta/<name>.json)를 확인한다. */
function loadFixture(name: string): Fixture {
  const dir = join(fixturesRoot, name);
  const metaFile = join(fixturesRoot, '..', 'fixtures-meta', `${name}.json`);
  if (!existsSync(metaFile))
    throw new Error(`${metaFile}가 없다. prepare-fixtures를 먼저 실행한다`);
  const meta = JSON.parse(readFileSync(metaFile, 'utf8')) as {
    fixtureBaseCommit: string;
    baseSha: string;
  };
  const baseCommit = execFileSync('git', ['-C', dir, 'rev-parse', `${BASE_TAG}^{commit}`], {
    encoding: 'utf8',
  }).trim();
  if (baseCommit !== meta.fixtureBaseCommit) {
    throw new Error(`${name}: base 태그가 ${baseCommit}이다. 메타는 ${meta.fixtureBaseCommit}`);
  }
  const dirty = execFileSync('git', ['-C', dir, 'status', '--porcelain'], { encoding: 'utf8' });
  if (dirty.trim() !== '') throw new Error(`${name}: 고정 사본이 바뀌어 있다\n${dirty}`);
  return { name, dir, baseCommit, upstreamBaseSha: meta.baseSha };
}

function selectProjects(): Fixture[] {
  const requested = list(opts.projects);
  if (mode === 'smoke' && requested === undefined)
    throw new Error('smoke는 --projects를 지정해야 한다');
  const names = requested ?? [...PROJECTS];
  for (const name of names) {
    if (!(PROJECTS as readonly string[]).includes(name))
      throw new Error(`알 수 없는 프로젝트: ${name}`);
  }
  return [...names].sort().map(loadFixture);
}

const arms = selectArms();
const fixtures = selectProjects();
for (const arm of arms) {
  if (arm.pluginDir !== null && !existsSync(join(arm.pluginDir, 'skills/migrate/SKILL.md'))) {
    throw new Error(`${arm.pluginDir}가 없다. pnpm eval:prepare-arms를 먼저 실행한다`);
  }
}
if (!existsSync(emptyMcpConfig)) throw new Error(`${emptyMcpConfig}가 없다`);
const env = networkBlockEnv();

const armPlans: ArmPlan[] = arms.map(({ name }) => ({ name, ...range }));
const plan = buildRunPlan(
  fixtures.map((f) => f.name),
  armPlans,
  seed,
);
mkdirSync(outRoot, { recursive: true });
writeFileSync(
  join(outRoot, `plan-${mode}-${String(range.fromRepeat)}-${String(range.toRepeat)}.json`),
  `${JSON.stringify({ label, mode, model, concurrency, seed, maxTurns, timeoutMs, fixturesRoot, workspaceRoot, fixtures, prompt: PROJECT_PROMPT, env, arms, repeats: range, plan }, null, 2)}\n`,
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
  fixture: Fixture,
  runDir: string,
  attempt: number,
): Promise<RunState> {
  // 지난 시도의 산출물이 남지 않게 실행 폴더를 비운다.
  rmSync(runDir, { recursive: true, force: true });
  mkdirSync(runDir, { recursive: true });
  const ws = prepareProjectWorkspace(fixture.dir, workspaceRoot);
  let meta: Record<string, unknown>;
  let state: RunState;
  let removeMs: number;
  try {
    const before = nodeModulesFingerprint(ws.dir);
    const result = await runProjectSession({
      command: 'claude',
      workspace: ws.dir,
      prefix: arm.prefix,
      config: { model, maxTurns, emptyMcpConfig, pluginDir: arm.pluginDir },
      expectation: { expectedSkill: arm.expectedSkill, targetPrefix: TARGET_PREFIX },
      timeoutMs,
      env,
    });
    writeFileSync(join(runDir, 'transcript.jsonl'), result.transcript, 'utf8');
    writeFileSync(join(runDir, 'stderr.txt'), result.stderr, 'utf8');
    const after = nodeModulesFingerprint(ws.dir);
    const saved = saveChanges(ws.dir, join(runDir, 'changes.patch'));
    state = result.state;
    meta = {
      ...spec,
      state,
      attempt,
      model: result.model,
      requestedModel: model,
      claudeVersion: result.claudeVersion,
      sessionId: result.sessionId,
      loadedSkills: result.loadedSkills,
      ...result.checks,
      networkAttempts: result.networkAttempts,
      answerAccess: result.answerAccess,
      limits: { maxTurns, timeoutMs },
      turn: result.turn,
      fixture: { baseCommit: fixture.baseCommit, upstreamBaseSha: fixture.upstreamBaseSha },
      patch: 'changes.patch',
      patchBytes: saved.patchBytes,
      changedFiles: saved.changedFiles,
      nodeModulesTouched: before !== after,
      nodeModulesFingerprint: { before, after },
      workspaceCopyMs: ws.copyMs,
    };
  } finally {
    // 예외가 나도 작업 폴더는 지운다.
    removeMs = removeTree(ws.dir);
  }
  meta = { ...meta, workspaceRemoveMs: removeMs, workspaceRemoved: !existsSync(ws.dir) };
  writeFileSync(
    join(runDir, 'meta.json'),
    `${JSON.stringify(meta, null, 2)}
`,
    'utf8',
  );
  return state;
}

async function runOne(spec: RunSpec): Promise<RunState | 'skipped'> {
  const runDir = join(outRoot, spec.runId);
  if (isDone(runDir)) return 'skipped';
  const arm = arms.find((a) => a.name === spec.arm);
  if (arm === undefined) throw new Error(`알 수 없는 arm: ${spec.arm}`);
  const fixture = fixtures.find((f) => f.name === spec.taskId);
  if (fixture === undefined) throw new Error(`알 수 없는 프로젝트: ${spec.taskId}`);

  let state: RunState = 'infra';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    state = await attemptOnce(spec, arm, fixture, runDir, attempt);
    // 인프라와 하네스의 실패만 다시 실행한다. 새 작업 폴더에서 처음부터 다시 돌린다.
    if (state !== 'infra' && state !== 'harness') break;
    // 일시 차단(예: 인증 요청의 403)은 몇 분 이어진다. 바로 다시 시도하면 같은 구간에서 또 실패한다.
    if (attempt < MAX_ATTEMPTS)
      await new Promise((resolve) => setTimeout(resolve, attempt * RETRY_DELAY_MS));
  }
  console.log(`${spec.runId}  ${state}`);
  return state;
}

console.log(
  `${mode}: 프로젝트 ${fixtures.map((f) => f.name).join('/')}, arm ${arms.map((a) => a.name).join('/')}, 회차 ${String(range.fromRepeat)}-${String(range.toRepeat)}, 실행 ${String(plan.length)}회, 모델 ${model}, ${String(maxTurns)}턴·${String(timeoutMin)}분, 동시 ${String(concurrency)}개, 작업 폴더 ${workspaceRoot}`,
);
const results = await executePlan(plan, concurrency, runOne);
const counts: Record<string, number> = {};
for (const r of results) {
  const key = r.ok ? r.value : 'exception';
  counts[key] = (counts[key] ?? 0) + 1;
}
console.log(`끝: ${JSON.stringify(counts)}`);
for (const r of results) if (!r.ok) console.log(`예외: ${String(r.error)}`);
