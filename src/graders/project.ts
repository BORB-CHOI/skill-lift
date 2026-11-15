/**
 * 프로젝트 단위 채점기(설계 문서 5절).
 *
 * 실행 하나의 changes.patch를 fixture 사본에 적용하고 아래 항목을 통과·실패로 매긴다. 점수는 통과 비율이다.
 * 1. lodashRemoved: 설정한 범위의 파일에 lodash 계열 import·require·타입 참조가 없다.
 * 2. lodashDependencyRemoved: 설정한 package.json들에 lodash 계열과 @types/lodash* 의존성이 없다.
 * 3. esToolkitDeclared: 배포 코드를 담은 package.json의 dependencies에 es-toolkit이 있다.
 * 4. typecheck: 타입 검사(또는 빌드) 명령이 0으로 끝난다.
 * 5. projectTests: 원래 커밋에서 실패하던 테스트 말고는 실패와 파일 오류가 없다.
 * 6. 숨김 검사: manifest.json의 id마다 한 항목. 해당 `it`이 통과해야 한다.
 * 패치가 적용되지 않으면 모든 항목이 실패다.
 */
import { randomUUID } from 'node:crypto';
import {
  cpSync,
  existsSync,
  globSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  collectEsToolkitFunctions,
  collectLodashFunctions,
  declaresEsToolkit,
  findLodashDependencies,
  findLodashReferences,
  parseNumstat,
  summarizeEntryPoints,
  type EntryKind,
  type EntryUsage,
} from './project-scan.js';
import {
  judgeHidden,
  judgeProjectTests,
  parseManifest,
  parseVitestReport,
  truncate,
  type BaselineEntry,
  type HiddenCheck,
  type TestCounts,
} from './project-vitest.js';
import {
  childEnv,
  git,
  prepareWorkspace,
  removeWorkspace,
  runCommand,
  withArgs,
  type CommandResult,
  type CommandSpec,
} from './project-workspace.js';

/** suites/es-toolkit/projects/<project>/grading.json */
export interface GradingConfig {
  /** 숨김 spec을 복사할 프로젝트 안 폴더(예: test/__hidden__). */
  readonly hiddenDest: string;
  /** lodash 참조를 찾을 파일 glob(프로젝트 루트 기준). */
  readonly lodashScanGlobs: readonly string[];
  /** 의존성을 검사할 package.json 경로. 첫 번째가 배포 코드를 담은 package.json이다. */
  readonly packageJsonPaths: readonly string[];
  /** fixture 메타의 명령 대신 쓸 명령. */
  readonly typecheckCommand?: string;
  readonly testCommand?: string;
  /** 모든 명령에 넣는 환경 변수(네트워크 차단 프록시 등). */
  readonly testEnv: Readonly<Record<string, string>>;
  /** junction으로 채울 node_modules 폴더(기본 ["node_modules"]). */
  readonly nodeModulesDirs?: readonly string[];
  /** 명령별 시간 한도(초). */
  readonly timeoutsSec?: {
    readonly typecheck?: number;
    readonly tests?: number;
    readonly hidden?: number;
  };
}

/** fixtures-meta/<project>.json에서 읽어 정리한 값. */
export interface FixtureMeta {
  readonly test: CommandSpec;
  readonly typecheck: CommandSpec;
  readonly baselineFailingTests: readonly BaselineEntry[];
  /** 원래 커밋의 테스트 수. 이보다 적으면 테스트를 지운 것으로 보고 기존 테스트 항목을 실패로 한다. */
  readonly baselineTestTotal: number;
}

/** fixtures-meta/<project>.json 원문에서 쓰는 필드. */
interface RawFixtureMeta {
  testCommand?: string;
  testArgv?: string[];
  testEnv?: Record<string, string>;
  typecheckCommand?: string;
  typecheckArgv?: string[];
  typecheckShell?: boolean;
  baselineFailingTests?: BaselineEntry[];
  testCounts?: { total?: number };
}

/**
 * 명령을 정한다. grading.json의 문자열 명령이 있으면 셸로 실행한다. 없으면 메타의 argv를 쓰고,
 * argv도 없으면 메타의 문자열 명령을 셸로 실행한다. 메타의 testCommand는 `CI=true ...`처럼 POSIX 셸
 * 문법이라 Windows 셸에서 돌지 않으므로 argv를 먼저 쓴다.
 */
export function resolveCommand(
  override: string | undefined,
  argv: readonly string[] | undefined,
  argvShell: boolean,
  command: string | undefined,
  env: Readonly<Record<string, string>>,
): CommandSpec | null {
  if (override !== undefined && override !== '') return { argv: [override], shell: true, env: {} };
  if (argv !== undefined && argv.length > 0) return { argv, shell: argvShell, env };
  if (command !== undefined && command !== '') return { argv: [command], shell: true, env };
  return null;
}

export interface ProjectSetup {
  readonly project: string;
  readonly fixtureDir: string;
  readonly config: GradingConfig;
  readonly meta: FixtureMeta;
  readonly hiddenDir: string;
  readonly hiddenChecks: readonly HiddenCheck[];
}

export interface SetupRoots {
  readonly fixturesRoot: string;
  readonly metaRoot: string;
  /** suites/es-toolkit/projects */
  readonly suiteRoot: string;
}

export function defaultRoots(repoRoot: string): SetupRoots {
  const evalProjects = resolve(repoRoot, '../../eval-projects');
  return {
    fixturesRoot: process.env.SKILL_EVAL_FIXTURES ?? join(evalProjects, 'fixtures'),
    metaRoot: process.env.SKILL_EVAL_FIXTURES_META ?? join(evalProjects, 'fixtures-meta'),
    suiteRoot: join(repoRoot, 'suites/es-toolkit/projects'),
  };
}

function readJson(file: string): unknown {
  const text = readFileSync(file, 'utf8');
  // BOM이 붙은 JSON도 읽는다.
  return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text) as unknown;
}

/** 프로젝트 하나의 설정·메타·숨김 검사를 읽는다. 빠진 파일이 있으면 예외를 던진다. */
export function loadProjectSetup(project: string, roots: SetupRoots): ProjectSetup {
  const projectDir = join(roots.suiteRoot, project);
  const config = readJson(join(projectDir, 'grading.json')) as GradingConfig;
  const raw = readJson(join(roots.metaRoot, `${project}.json`)) as RawFixtureMeta;
  const env = raw.testEnv ?? {};
  const test = resolveCommand(config.testCommand, raw.testArgv, false, raw.testCommand, env);
  const typecheck = resolveCommand(
    config.typecheckCommand,
    raw.typecheckArgv,
    raw.typecheckShell ?? false,
    raw.typecheckCommand,
    {},
  );
  if (test === null || typecheck === null) {
    throw new Error(`${project}: 테스트·타입 검사 명령이 grading.json에도 fixture 메타에도 없다`);
  }
  const meta: FixtureMeta = {
    test,
    typecheck,
    baselineFailingTests: raw.baselineFailingTests ?? [],
    baselineTestTotal: raw.testCounts?.total ?? 0,
  };
  const hiddenDir = join(projectDir, 'hidden');
  const hiddenChecks = parseManifest(readJson(join(hiddenDir, 'manifest.json')));
  const fixtureDir = join(roots.fixturesRoot, project);
  if (!existsSync(join(fixtureDir, 'package.json'))) throw new Error(`fixture 없음: ${fixtureDir}`);
  return { project, fixtureDir, config, meta, hiddenDir, hiddenChecks };
}

export type ItemKind =
  | 'lodashRemoved'
  | 'lodashDependencyRemoved'
  | 'esToolkitDeclared'
  | 'typecheck'
  | 'projectTests'
  | 'hidden';

export interface GradeItem {
  readonly id: string;
  readonly kind: ItemKind;
  readonly pass: boolean;
  readonly detail: unknown;
}

export interface ProjectGrade {
  readonly project: string;
  readonly items: readonly GradeItem[];
  /** 통과 항목 비율. 시간·턴 한도에 걸린 실행은 0이다. */
  readonly score: number;
  /** 한도 실행에서 항목을 그대로 매겼을 때의 점수(부차 기록). */
  readonly rawScore: number;
  readonly applyError: string | null;
  readonly counts: {
    readonly items: number;
    readonly passed: number;
    readonly tests: TestCounts | null;
    readonly hidden: { readonly total: number; readonly passed: number };
  };
  readonly secondary: {
    readonly changedFiles: number;
    readonly linesAdded: number;
    readonly linesDeleted: number;
    /** 원래 lodash 함수마다 전환 뒤 같은 이름을 가져온 es-toolkit 진입점. */
    readonly entryPoints: Readonly<Record<string, EntryUsage>>;
  };
  readonly durations: Readonly<Record<string, number>>;
}

export interface GradeOptions {
  readonly setup: ProjectSetup;
  /** changes.patch 경로. 내용이 비었으면 아무것도 바꾸지 않은 제출이다. */
  readonly patchFile: string;
  /** 한도 실행이면 점수를 0으로 매긴다. */
  readonly zeroScore?: boolean;
  /** 작업 폴더를 만들 상위 폴더. 기본은 SKILL_EVAL_GRADE_TMP 또는 OS 임시 폴더. */
  readonly tmpRoot?: string;
  /** 진행 상황 출력. */
  readonly log?: (msg: string) => void;
}

const FIXED_ITEMS: readonly { id: string; kind: ItemKind }[] = [
  { id: 'lodashRemoved', kind: 'lodashRemoved' },
  { id: 'lodashDependencyRemoved', kind: 'lodashDependencyRemoved' },
  { id: 'esToolkitDeclared', kind: 'esToolkitDeclared' },
  { id: 'typecheck', kind: 'typecheck' },
  { id: 'projectTests', kind: 'projectTests' },
];

export async function gradeProject(opts: GradeOptions): Promise<ProjectGrade> {
  const { setup } = opts;
  const log = opts.log ?? ((): void => undefined);
  const nmDirs = setup.config.nodeModulesDirs ?? ['node_modules'];
  const base = join(
    opts.tmpRoot ?? process.env.SKILL_EVAL_GRADE_TMP ?? join(tmpdir(), 'skill-eval-grade'),
    randomUUID().slice(0, 8),
  );
  const work = join(base, 'project');
  const out = join(base, 'out');
  const durations: Record<string, number> = {};
  const timed = async <T>(name: string, fn: () => T | Promise<T>): Promise<T> => {
    const t = Date.now();
    try {
      return await fn();
    } finally {
      durations[name] = Date.now() - t;
    }
  };
  const total = Date.now();
  try {
    mkdirSync(out, { recursive: true });
    await timed('copy', () => {
      prepareWorkspace(setup.fixtureDir, work, nmDirs);
    });
    const patchText = existsSync(opts.patchFile) ? readFileSync(opts.patchFile, 'utf8') : null;
    const applied = await timed('apply', () => applyPatch(work, opts.patchFile, patchText));
    log(`적용 ${applied.error === null ? '성공' : `실패: ${applied.error}`}`);
    if (applied.error !== null) {
      return finish(
        setup,
        failAll(setup, applied.error),
        applied.error,
        null,
        emptySecondary(),
        durations,
        total,
        opts.zeroScore,
      );
    }
    const items: GradeItem[] = [];
    items.push(await timed('lodashRemoved', () => checkLodashRemoved(work, setup.config)));
    items.push(...(await timed('packageJson', () => checkPackageJsons(work, setup.config))));
    const env = childEnv(setup.config.testEnv);
    const t = setup.config.timeoutsSec ?? {};
    log('타입 검사');
    const tc = await timed('typecheck', () =>
      runCommand(setup.meta.typecheck, { cwd: work, env, timeoutMs: (t.typecheck ?? 1200) * 1000 }),
    );
    items.push({
      id: 'typecheck',
      kind: 'typecheck',
      pass: tc.exitCode === 0 && !tc.timedOut,
      detail: commandDetail(tc),
    });
    log('기존 테스트');
    const tests = await timed('projectTests', () =>
      runProjectTests(setup, work, out, env, (t.tests ?? 1800) * 1000),
    );
    items.push(tests.item);
    log('숨김 검사');
    items.push(
      ...(await timed('hidden', () => runHidden(setup, work, out, env, (t.hidden ?? 900) * 1000))),
    );
    const secondary = await timed('secondary', () => ({
      ...applied.stats,
      entryPoints: entryPoints(setup, work),
    }));
    return finish(setup, items, null, tests.counts, secondary, durations, total, opts.zeroScore);
  } finally {
    const t = Date.now();
    removeWorkspace(
      base,
      nmDirs.map((d) => join('project', d)),
    );
    durations.cleanup = Date.now() - t;
  }
}

function emptySecondary(): ProjectGrade['secondary'] {
  return { changedFiles: 0, linesAdded: 0, linesDeleted: 0, entryPoints: {} };
}

function failAll(setup: ProjectSetup, reason: string): GradeItem[] {
  return [
    ...FIXED_ITEMS.map((i) => ({ ...i, pass: false, detail: reason })),
    ...setup.hiddenChecks.map((h) => ({
      id: h.id,
      kind: 'hidden' as const,
      pass: false,
      detail: reason,
    })),
  ];
}

function finish(
  setup: ProjectSetup,
  items: GradeItem[],
  applyError: string | null,
  tests: TestCounts | null,
  secondary: ProjectGrade['secondary'],
  durations: Record<string, number>,
  start: number,
  zeroScore: boolean | undefined,
): ProjectGrade {
  const passed = items.filter((i) => i.pass).length;
  const rawScore = items.length === 0 ? 0 : passed / items.length;
  const hidden = items.filter((i) => i.kind === 'hidden');
  durations.total = Date.now() - start;
  return {
    project: setup.project,
    items,
    score: zeroScore === true ? 0 : rawScore,
    rawScore,
    applyError,
    counts: {
      items: items.length,
      passed,
      tests,
      hidden: { total: hidden.length, passed: hidden.filter((i) => i.pass).length },
    },
    secondary,
    durations,
  };
}

function applyPatch(
  work: string,
  patchFile: string,
  text: string | null,
): {
  error: string | null;
  stats: { changedFiles: number; linesAdded: number; linesDeleted: number };
} {
  const none = { changedFiles: 0, linesAdded: 0, linesDeleted: 0 };
  if (text === null) return { error: 'changes.patch 없음', stats: none };
  if (text.trim() === '') return { error: null, stats: none };
  const num = git(work, ['apply', '--numstat', patchFile]);
  const r = git(work, ['apply', '--binary', '--whitespace=nowarn', patchFile]);
  if (!r.ok) return { error: `git apply 실패: ${truncate(r.out)}`, stats: none };
  const s = parseNumstat(num.out);
  return {
    error: null,
    stats: { changedFiles: s.files, linesAdded: s.added, linesDeleted: s.deleted },
  };
}

function scanFiles(root: string, globs: readonly string[]): string[] {
  const files = new Set<string>();
  for (const g of globs) {
    for (const f of globSync(g, {
      cwd: root,
      exclude: (p) => p.split(/[\\/]/).includes('node_modules'),
    })) {
      if (statSync(join(root, f)).isFile()) files.add(f.replace(/\\/g, '/'));
    }
  }
  return [...files].sort();
}

function checkLodashRemoved(work: string, config: GradingConfig): GradeItem {
  const files = scanFiles(work, config.lodashScanGlobs);
  const refs = files.flatMap((f) => findLodashReferences(f, readFileSync(join(work, f), 'utf8')));
  return {
    id: 'lodashRemoved',
    kind: 'lodashRemoved',
    pass: refs.length === 0,
    detail: {
      scannedFiles: files.length,
      references: refs.slice(0, 50),
      referenceCount: refs.length,
    },
  };
}

function checkPackageJsons(work: string, config: GradingConfig): GradeItem[] {
  const deps: { file: string; field: string; name: string }[] = [];
  const errors: string[] = [];
  let shipDeclares = false;
  config.packageJsonPaths.forEach((rel, i) => {
    let pkg: unknown;
    try {
      pkg = readJson(join(work, rel));
    } catch (e) {
      errors.push(`${rel}: ${(e as Error).message}`);
      return;
    }
    for (const d of findLodashDependencies(pkg)) deps.push({ file: rel, ...d });
    if (i === 0) shipDeclares = declaresEsToolkit(pkg);
  });
  return [
    {
      id: 'lodashDependencyRemoved',
      kind: 'lodashDependencyRemoved',
      pass: deps.length === 0 && errors.length === 0,
      detail: { remaining: deps, errors },
    },
    {
      id: 'esToolkitDeclared',
      kind: 'esToolkitDeclared',
      pass: shipDeclares,
      detail: { packageJson: config.packageJsonPaths[0], errors },
    },
  ];
}

function commandDetail(r: CommandResult): Record<string, unknown> {
  return {
    exitCode: r.exitCode,
    timedOut: r.timedOut,
    durationMs: r.durationMs,
    ...(r.exitCode === 0 ? {} : { tail: truncate(r.tail, 3000) }),
  };
}

async function runVitest(
  command: CommandSpec,
  work: string,
  outFile: string,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
  filters: readonly string[],
): Promise<{
  run: CommandResult;
  report: ReturnType<typeof parseVitestReport> | null;
  error: string | null;
}> {
  const cmd = withArgs(command, ['--reporter=json', `--outputFile=${outFile}`, ...filters]);
  const run = await runCommand(cmd, { cwd: work, env, timeoutMs });
  if (run.timedOut) return { run, report: null, error: '시간 한도 초과' };
  if (!existsSync(outFile))
    return { run, report: null, error: `json 보고서 없음: ${truncate(run.tail, 2000)}` };
  try {
    return { run, report: parseVitestReport(readJson(outFile), work), error: null };
  } catch (e) {
    return { run, report: null, error: (e as Error).message };
  }
}

async function runProjectTests(
  setup: ProjectSetup,
  work: string,
  out: string,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<{ item: GradeItem; counts: TestCounts | null }> {
  const r = await runVitest(setup.meta.test, work, join(out, 'tests.json'), env, timeoutMs, []);
  if (r.report === null) {
    return {
      item: {
        id: 'projectTests',
        kind: 'projectTests',
        pass: false,
        detail: { error: r.error, exitCode: r.run.exitCode },
      },
      counts: null,
    };
  }
  const j = judgeProjectTests(
    r.report,
    setup.meta.baselineFailingTests,
    setup.meta.baselineTestTotal,
  );
  return {
    item: {
      id: 'projectTests',
      kind: 'projectTests',
      pass: j.pass,
      detail: {
        exitCode: r.run.exitCode,
        counts: j.counts,
        unexpectedFailures: j.unexpectedFailures.slice(0, 50),
        excusedFailures: j.excusedFailures,
        fileErrors: j.fileErrors
          .slice(0, 20)
          .map((f) => ({ file: f.file, message: truncate(f.message, 400) })),
      },
    },
    counts: j.counts,
  };
}

async function runHidden(
  setup: ProjectSetup,
  work: string,
  out: string,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<GradeItem[]> {
  const dest = join(work, setup.config.hiddenDest);
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(setup.hiddenDir)) {
    if (name === 'manifest.json') continue;
    cpSync(join(setup.hiddenDir, name), join(dest, name), { recursive: true });
  }
  const filter = setup.config.hiddenDest.replace(/\\/g, '/');
  const r = await runVitest(setup.meta.test, work, join(out, 'hidden.json'), env, timeoutMs, [
    filter,
  ]);
  if (r.report === null) {
    const reason = `숨김 검사 실행 실패: ${r.error ?? ''}`;
    return setup.hiddenChecks.map((h) => ({
      id: h.id,
      kind: 'hidden',
      pass: false,
      detail: reason,
    }));
  }
  return judgeHidden(r.report, setup.hiddenChecks, filter).map((h) => ({
    id: h.id,
    kind: 'hidden',
    pass: h.pass,
    detail: h.detail,
  }));
}

/** 원래 lodash 함수(fixture 기준)마다 전환 뒤 어느 진입점에서 가져오는지 센다. */
function entryPoints(setup: ProjectSetup, work: string): Record<string, EntryUsage> {
  const before = new Set<string>();
  for (const f of scanFiles(setup.fixtureDir, setup.config.lodashScanGlobs)) {
    for (const fn of collectLodashFunctions(readFileSync(join(setup.fixtureDir, f), 'utf8')))
      before.add(fn);
  }
  const after = new Map<string, Set<EntryKind>>();
  for (const f of scanFiles(work, setup.config.lodashScanGlobs)) {
    if (f.startsWith(setup.config.hiddenDest.replace(/\\/g, '/'))) continue;
    for (const [fn, kinds] of collectEsToolkitFunctions(readFileSync(join(work, f), 'utf8'))) {
      const set = after.get(fn) ?? new Set<EntryKind>();
      for (const k of kinds) set.add(k);
      after.set(fn, set);
    }
  }
  return summarizeEntryPoints(before, after);
}
