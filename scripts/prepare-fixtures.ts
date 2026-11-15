/**
 * 프로젝트 전환 과제의 고정 사본(fixture)을 만든다.
 *
 * 각 프로젝트마다:
 * 1. 원본 체크아웃이 기준 커밋에 있고 추적 파일이 그대로인지 확인한다(원본은 고치지 않는다).
 * 2. 추적 파일만 꺼낸다(git checkout-index). .git, .yarn/cache, 빌드 산출물, 추적 안 되는 파일은 빠진다.
 * 3. 원본의 node_modules를 복사하고 node_modules/es-toolkit을 1.53.2로 바꾼다.
 *    package.json에는 es-toolkit을 넣지 않는다. 의존성 선언은 에이전트가 할 일이다.
 * 4. 새 Git 저장소를 만들고 커밋 하나("base", 태그 base)를 남긴다. node_modules는 info/exclude로 뺀다.
 *    날짜를 고정해 다시 만들어도 같은 커밋 해시가 나오게 한다.
 * 5. 고정 사본을 복사한 임시 폴더에서 테스트·타입 검사를 네트워크 차단 환경으로 한 번 돌려
 *    원래 실패하는 테스트를 기록한다. 고정 사본에서 직접 돌리지 않는 이유: 빌드가 dist와
 *    package.json을 고칠 수 있다.
 *
 * 사용: pnpm tsx scripts/prepare-fixtures.ts [--projects recharts,swagger-typescript-api]
 *        [--root D:\Develop\eval-projects] [--skip-baseline]
 * 출력: <root>/fixtures/<name>/, <root>/fixtures-meta/<name>.json
 */
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { networkBlockEnv } from '../src/runner/claude.js';
import {
  BASE_TAG,
  copyTree,
  prepareProjectWorkspace,
  removeTree,
} from '../src/runner/workspace.js';

const ES_TOOLKIT_VERSION = '1.53.2';
/** 기준 커밋의 작성 시각. 고정해야 커밋 해시가 재현된다. */
const BASE_DATE = '2026-01-01T00:00:00Z';

interface ProjectSpec {
  readonly name: string;
  readonly upstream: string;
  readonly baseSha: string;
  readonly packageManager: string;
  /** 사람이 읽는 명령. 채점기는 아래 argv를 쓴다. */
  readonly testCommand: string;
  /** 고정 사본 폴더에서 node로 실행하는 인자. 셸과 패키지 관리자를 거치지 않는다. */
  readonly testArgv: readonly string[];
  readonly testEnv: Readonly<Record<string, string>>;
  readonly typecheckCommand: string;
  /** 타입 검사(또는 빌드)를 셸로 실행할지, node로 실행할지. */
  readonly typecheckArgv: readonly string[];
  readonly typecheckShell: boolean;
}

const PROJECTS: readonly ProjectSpec[] = [
  {
    name: 'recharts',
    upstream: 'recharts/recharts',
    baseSha: 'a28c686267d76ede2fc4df6927219c030dab3fe3',
    packageManager: 'npm',
    testCommand: 'npx vitest run --config vitest.config.mts',
    testArgv: ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.mts'],
    testEnv: {},
    typecheckCommand: 'npm run check-types',
    typecheckArgv: ['npm run check-types'],
    typecheckShell: true,
  },
  {
    name: 'swagger-typescript-api',
    upstream: 'acacode/swagger-typescript-api',
    baseSha: '65addaf1a68a3cf136d7ccb20dff3899bb7718b0',
    packageManager: 'yarn@4.12.0',
    // yarn은 .yarn/cache 없이 설치 상태를 확인하려 하므로 vitest를 직접 부른다.
    testCommand: 'CI=true node_modules/.bin/vitest run --testTimeout=60000',
    testArgv: ['node_modules/vitest/vitest.mjs', 'run', '--testTimeout=60000'],
    testEnv: { CI: 'true' },
    // tsc --noEmit은 기준 커밋에서 이미 오류가 많다. 저장소의 빌드(tsdown, dts 포함)를 쓴다.
    typecheckCommand: 'node_modules/.bin/tsdown',
    typecheckArgv: ['node_modules/tsdown/dist/run.mjs'],
    typecheckShell: false,
  },
];

const { values: opts } = parseArgs({
  options: {
    projects: { type: 'string' },
    root: { type: 'string', default: 'D:\\Develop\\eval-projects' },
    'skip-baseline': { type: 'boolean', default: false },
  },
  strict: true,
});

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const evalRoot = opts.root;
const fixturesRoot = join(evalRoot, 'fixtures');
const metaRoot = join(evalRoot, 'fixtures-meta');

function sh(cwd: string, args: readonly string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    windowsHide: true,
  }).trim();
}

/** 원본 체크아웃이 기준 커밋이고 추적 파일이 고쳐지지 않았는지 확인한다. */
function verifyCheckout(spec: ProjectSpec, checkout: string): void {
  const head = sh(checkout, ['rev-parse', 'HEAD']);
  if (head !== spec.baseSha)
    throw new Error(`${spec.name}: HEAD가 ${head}이다. ${spec.baseSha}이어야 한다`);
  const dirty = sh(checkout, ['status', '--porcelain', '--untracked-files=no']);
  if (dirty !== '') throw new Error(`${spec.name}: 추적 파일이 고쳐져 있다\n${dirty}`);
}

function readVersion(pkgDir: string): string | null {
  const file = join(pkgDir, 'package.json');
  if (!existsSync(file)) return null;
  const version = (JSON.parse(readFileSync(file, 'utf8')) as { version?: unknown }).version;
  return typeof version === 'string' ? version : null;
}

/** 이 저장소의 node_modules(pnpm 링크)에서 es-toolkit 실제 폴더를 찾는다. */
function esToolkitSource(): string {
  const dir = realpathSync(join(repoRoot, 'node_modules/es-toolkit'));
  const version = readVersion(dir);
  if (version !== ES_TOOLKIT_VERSION) {
    throw new Error(
      `${dir}의 es-toolkit이 ${String(version)}이다. ${ES_TOOLKIT_VERSION}이어야 한다`,
    );
  }
  return dir;
}

function dirBytes(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) total += statSync(join(entry.parentPath, entry.name)).size;
  }
  return total;
}

function initBaseRepo(fixture: string): string {
  const env = {
    ...process.env,
    GIT_AUTHOR_DATE: BASE_DATE,
    GIT_COMMITTER_DATE: BASE_DATE,
  };
  const run = (args: readonly string[]): string =>
    execFileSync('git', ['-C', fixture, ...args], {
      encoding: 'utf8',
      env,
      windowsHide: true,
    }).trim();
  run(['init', '--quiet', '--initial-branch=main']);
  run(['config', 'core.autocrlf', 'false']);
  run(['config', 'user.name', 'eval']);
  run(['config', 'user.email', 'eval@localhost']);
  // 프로젝트 .gitignore와 상관없이 node_modules는 저장소에서 뺀다. info/exclude는 추적 파일이 아니다.
  writeFileSync(join(fixture, '.git/info/exclude'), 'node_modules/\n', 'utf8');
  run(['add', '-A']);
  run(['commit', '--quiet', '--no-verify', '-m', 'base']);
  run(['tag', BASE_TAG]);
  const ignored = spawnSync(
    'git',
    ['-C', fixture, 'check-ignore', '-q', 'node_modules/es-toolkit'],
    {
      windowsHide: true,
    },
  );
  if (ignored.status !== 0) throw new Error(`${fixture}: node_modules가 무시되지 않는다`);
  return run(['rev-parse', 'HEAD']);
}

interface VitestJson {
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  numTodoTests?: number;
  numTotalTestSuites: number;
  testResults: {
    name: string;
    status: string;
    message?: string;
    assertionResults: { fullName: string; status: string }[];
  }[];
}

interface Baseline {
  readonly failing: string[];
  readonly counts: Record<string, number>;
  readonly durationMs: number;
  readonly exitCode: number | null;
}

/** vitest JSON 결과에서 실패한 테스트 ID(`<파일> > <전체 이름>`)를 뽑는다. 파일 자체가 실패하면 `<파일> > (file)`. */
function failingIds(report: VitestJson, ws: string): string[] {
  const ids: string[] = [];
  for (const file of report.testResults) {
    const rel = relative(ws, file.name).split('\\').join('/');
    const failed = file.assertionResults.filter((a) => a.status === 'failed');
    for (const a of failed) ids.push(`${rel} > ${a.fullName}`);
    if (file.status === 'failed' && failed.length === 0) ids.push(`${rel} > (file)`);
  }
  return ids.sort();
}

function runTests(spec: ProjectSpec, ws: string, outFile: string): Baseline {
  const env = { ...process.env, ...networkBlockEnv(), ...spec.testEnv };
  const started = Date.now();
  const result = spawnSync(
    process.execPath,
    [...spec.testArgv, '--reporter=json', `--outputFile=${outFile}`],
    {
      cwd: ws,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      maxBuffer: 512 * 1024 * 1024,
    },
  );
  const durationMs = Date.now() - started;
  if (!existsSync(outFile)) {
    throw new Error(
      `${spec.name}: vitest JSON이 없다\n${result.stderr.toString('utf8').slice(-2000)}`,
    );
  }
  const report = JSON.parse(readFileSync(outFile, 'utf8')) as VitestJson;
  return {
    failing: failingIds(report, ws),
    counts: {
      // numTotalTestSuites는 describe 블록 수다. 파일 수는 testResults에서 센다.
      files: report.testResults.length,
      failedFiles: report.testResults.filter((f) => f.status === 'failed').length,
      suites: report.numTotalTestSuites,
      total: report.numTotalTests,
      passed: report.numPassedTests,
      failed: report.numFailedTests,
      skipped: report.numPendingTests,
      todo: report.numTodoTests ?? 0,
    },
    durationMs,
    exitCode: result.status,
  };
}

function runTypecheck(spec: ProjectSpec, ws: string, logFile: string) {
  const env = { ...process.env, ...networkBlockEnv() };
  const started = Date.now();
  const options = { cwd: ws, env, windowsHide: true, maxBuffer: 256 * 1024 * 1024 } as const;
  const result = spec.typecheckShell
    ? spawnSync(spec.typecheckArgv.join(' '), { ...options, shell: true })
    : spawnSync(process.execPath, [...spec.typecheckArgv], options);
  writeFileSync(logFile, Buffer.concat([result.stdout, result.stderr]));
  return { exitCode: result.status, durationMs: Date.now() - started };
}

function prepare(spec: ProjectSpec): void {
  const checkout = join(evalRoot, spec.name);
  const fixture = join(fixturesRoot, spec.name);
  verifyCheckout(spec, checkout);

  console.log(`${spec.name}: 추적 파일을 꺼낸다`);
  rmSync(fixture, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  mkdirSync(fixture, { recursive: true });
  // checkout-index의 --prefix는 끝에 /가 있어야 폴더로 본다.
  const prefix = `${fixture.split('\\').join('/')}/`;
  sh(checkout, ['checkout-index', '--all', '--force', `--prefix=${prefix}`]);
  rmSync(join(fixture, '.yarn/cache'), { recursive: true, force: true });

  console.log(`${spec.name}: node_modules를 복사한다`);
  const copyStarted = Date.now();
  copyTree(join(checkout, 'node_modules'), join(fixture, 'node_modules'));
  const nodeModulesCopyMs = Date.now() - copyStarted;
  const esDir = join(fixture, 'node_modules/es-toolkit');
  const previousEsToolkit = readVersion(esDir);
  rmSync(esDir, { recursive: true, force: true });
  copyTree(esToolkitSource(), esDir);
  if (readVersion(esDir) !== ES_TOOLKIT_VERSION) throw new Error(`${esDir}의 버전이 다르다`);

  const declared = JSON.parse(readFileSync(join(fixture, 'package.json'), 'utf8')) as Record<
    string,
    Record<string, string> | undefined
  >;
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
    if (declared[field]?.['es-toolkit'] !== undefined) {
      throw new Error(`${spec.name}: package.json ${field}에 es-toolkit이 이미 있다`);
    }
  }

  console.log(`${spec.name}: 기준 커밋을 만든다`);
  const fixtureBaseCommit = initBaseRepo(fixture);
  const fixtureFileCount = sh(fixture, ['ls-files']).split('\n').length;
  const nodeModulesBytes = dirBytes(join(fixture, 'node_modules'));

  const meta: Record<string, unknown> = {
    name: spec.name,
    upstream: spec.upstream,
    baseSha: spec.baseSha,
    packageManager: spec.packageManager,
    testCommand: spec.testCommand,
    testArgv: ['node', ...spec.testArgv],
    testEnv: spec.testEnv,
    typecheckCommand: spec.typecheckCommand,
    typecheckArgv: spec.typecheckShell ? spec.typecheckArgv : ['node', ...spec.typecheckArgv],
    typecheckShell: spec.typecheckShell,
    fixtureDir: fixture,
    fixtureBaseCommit,
    fixtureBaseTag: BASE_TAG,
    fixtureFileCount,
    nodeModulesBytes,
    nodeModulesCopyMs,
    esToolkit: { installed: ES_TOOLKIT_VERSION, replaced: previousEsToolkit },
    networkEnv: networkBlockEnv(),
  };

  if (!opts['skip-baseline']) {
    const ws = prepareProjectWorkspace(fixture);
    meta['workspaceCopyMs'] = ws.copyMs;
    console.log(`${spec.name}: 사본 복사 ${String(ws.copyMs)}ms, 기준 테스트를 돌린다`);
    try {
      const testJson = join(metaRoot, `${spec.name}.baseline-tests.json`);
      const tests = runTests(spec, ws.dir, testJson);
      meta['baselineFailingTests'] = tests.failing;
      meta['testCounts'] = tests.counts;
      meta['baselineTestDurationMs'] = tests.durationMs;
      meta['baselineTestExitCode'] = tests.exitCode;
      console.log(
        `${spec.name}: 테스트 ${JSON.stringify(tests.counts)} ${String(tests.durationMs)}ms`,
      );
      const typecheck = runTypecheck(
        spec,
        ws.dir,
        join(metaRoot, `${spec.name}.baseline-typecheck.log`),
      );
      meta['baselineTypecheck'] = typecheck;
      console.log(`${spec.name}: 타입 검사 ${JSON.stringify(typecheck)}`);
    } finally {
      meta['workspaceRemoveMs'] = removeTree(ws.dir);
    }
  }
  meta['preparedAt'] = new Date().toISOString();
  writeFileSync(join(metaRoot, `${spec.name}.json`), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
}

const wanted = opts.projects?.split(',').map((s) => s.trim()) ?? PROJECTS.map((p) => p.name);
mkdirSync(metaRoot, { recursive: true });
mkdirSync(fixturesRoot, { recursive: true });
for (const name of wanted) {
  const spec = PROJECTS.find((p) => p.name === name);
  if (spec === undefined) throw new Error(`알 수 없는 프로젝트: ${name}`);
  prepare(spec);
}
