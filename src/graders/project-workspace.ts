/**
 * 채점용 작업 폴더: fixture 복사, node_modules 연결, 패치 적용, 명령 실행, 정리.
 *
 * node_modules는 복사하지 않는다. 실측(recharts, 478MB)으로 통째 복사는 14~24초, 삭제는 20초 걸렸고
 * node_modules를 뺀 복사는 4.6초였다. 대신 작업 폴더에 진짜 node_modules 폴더를 만들고 그 안의 패키지마다
 * fixture 쪽으로 junction을 건다. 이러면 vite·vitest·babel이 쓰는 캐시(node_modules/.vite, .cache)는
 * 작업 폴더에 생기고 fixture의 node_modules는 바뀌지 않는다. 점(.)으로 시작하는 폴더는 캐시로 보고
 * 연결하지 않는다(.bin만 예외).
 */
import { spawn, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';

/** fixture를 dest로 복사한다. node_modules라는 이름의 폴더는 모두 빼고 복사한 뒤 junction으로 채운다. */
export function prepareWorkspace(
  fixtureDir: string,
  dest: string,
  nodeModulesDirs: readonly string[],
): void {
  mkdirSync(dest, { recursive: true });
  if (process.platform === 'win32') {
    const r = spawnSync(
      'robocopy',
      [
        fixtureDir,
        dest,
        '/MIR',
        '/MT:16',
        '/XD',
        'node_modules',
        '/NFL',
        '/NDL',
        '/NJH',
        '/NJS',
        '/NP',
        '/R:1',
        '/W:1',
      ],
      { encoding: 'utf8' },
    );
    // robocopy 종료 코드 0~7은 성공, 8 이상은 실패다.
    if (r.status === null || r.status >= 8) {
      throw new Error(`robocopy 실패(${String(r.status)}): ${r.stdout}${r.stderr}`);
    }
  } else {
    cpSync(fixtureDir, dest, {
      recursive: true,
      filter: (src) => !src.split(/[\\/]/).includes('node_modules'),
    });
  }
  for (const rel of nodeModulesDirs) linkNodeModules(join(fixtureDir, rel), join(dest, rel));
}

function linkNodeModules(src: string, dest: string): void {
  if (!existsSync(src)) return;
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src)) {
    const from = join(src, name);
    const to = join(dest, name);
    const st = lstatSync(from);
    if (st.isSymbolicLink()) {
      // 워크스페이스 링크 등: 실제 경로로 다시 건다.
      const real = realpathSync(from);
      if (statSync(real).isDirectory()) symlinkSync(real, to, 'junction');
      else copyFileSync(real, to);
    } else if (st.isDirectory()) {
      if (name.startsWith('.') && name !== '.bin') continue;
      symlinkSync(from, to, 'junction');
    } else {
      copyFileSync(from, to);
    }
  }
}

/** 작업 폴더를 지운다. junction은 먼저 링크만 끊어서 fixture 쪽 내용을 건드리지 않는다. */
export function removeWorkspace(dir: string, nodeModulesDirs: readonly string[]): void {
  for (const rel of nodeModulesDirs) {
    const nm = join(dir, rel);
    if (!existsSync(nm)) continue;
    for (const name of readdirSync(nm)) {
      const p = join(nm, name);
      if (lstatSync(p).isSymbolicLink()) unlinkSync(p);
    }
  }
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
}

export interface CommandResult {
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly durationMs: number;
  /** 출력(표준 출력+오류)의 끝부분. */
  readonly tail: string;
}

const TAIL_BYTES = 8000;

/**
 * 실행할 명령. shell이 false면 argv를 그대로 실행하고(첫 요소 "node"는 지금 node로 바꾼다),
 * true면 argv를 공백으로 이어 셸에 넘긴다.
 */
export interface CommandSpec {
  readonly argv: readonly string[];
  readonly shell: boolean;
  readonly env: Readonly<Record<string, string>>;
}

/** 명령 뒤에 인자를 붙인다. 셸 명령이면 appendArgs 규칙을 따른다. */
export function withArgs(spec: CommandSpec, args: readonly string[]): CommandSpec {
  if (spec.shell) return { ...spec, argv: [appendArgs(spec.argv.join(' '), args)] };
  return { ...spec, argv: [...spec.argv, ...args] };
}

/** 명령을 실행한다. 시간을 넘기면 프로세스 트리를 죽인다. */
export function runCommand(
  spec: CommandSpec,
  opts: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number },
): Promise<CommandResult> {
  const start = Date.now();
  const env = { ...opts.env, ...spec.env };
  return new Promise((resolve) => {
    const [head = '', ...rest] = spec.argv;
    const child = spec.shell
      ? spawn(spec.argv.join(' '), { cwd: opts.cwd, env, shell: true, windowsHide: true })
      : spawn(head === 'node' ? process.execPath : head, rest, {
          cwd: opts.cwd,
          env,
          windowsHide: true,
        });
    let tail = '';
    const onData = (chunk: Buffer): void => {
      tail = (tail + chunk.toString('utf8')).slice(-TAIL_BYTES);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
    }, opts.timeoutMs);
    child.on('error', (err) => {
      tail += `\n[spawn 오류] ${err.message}`;
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code, timedOut, durationMs: Date.now() - start, tail });
    });
  });
}

function killTree(pid: number | undefined): void {
  if (pid === undefined) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
  } else {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      process.kill(pid, 'SIGKILL');
    }
  }
}

/** git 명령을 동기로 실행한다. */
export function git(cwd: string, args: readonly string[]): { ok: boolean; out: string } {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  return { ok: r.status === 0, out: `${r.stdout}${r.stderr}` };
}

/**
 * 명령 뒤에 인자를 붙인다. `npm test`·`npm run x`는 `--` 뒤로 넘겨야 스크립트에 전달된다.
 * 인자에 공백이 있으면 큰따옴표로 감싼다.
 */
export function appendArgs(command: string, args: readonly string[]): string {
  const quoted = args.map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a));
  const needsDashDash =
    /^npm\s+(?:test|t|run\s+\S+|run-script\s+\S+)/.test(command.trim()) &&
    !/\s--(?:\s|$)/.test(command);
  return [command.trim(), ...(needsDashDash ? ['--'] : []), ...quoted].join(' ');
}

/** 자식 프로세스 환경: 현재 환경에 설정 값을 덮고, tsx가 넣은 NODE_OPTIONS는 뺀다. */
export function childEnv(extra: Readonly<Record<string, string>>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra };
  if (env.NODE_OPTIONS?.includes('tsx') === true) delete env.NODE_OPTIONS;
  return env;
}
