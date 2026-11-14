/**
 * `claude -p` 실행.
 *
 * 0단계 실측(Claude Code 2.1.316, Windows 11)으로 정한 것:
 * - 사용자 설정·훅·MCP·CLAUDE.md는 실행 옵션으로 차단한다 (ISOLATION_ARGS).
 * - 기본 권한에서는 파일 쓰기가 거부되므로 편집을 자동 승인하고, Bash는 허용 목록과
 *   거부 목록을 모든 arm에 똑같이 준다.
 * - 프롬프트는 인자가 아니라 stdin으로 넘긴다. 셸 인코딩의 영향을 받지 않는다.
 * - 타임아웃 때는 에이전트가 띄운 자식 프로세스까지 종료한다.
 * - 실행 하나는 두 턴이다. 두 번째 턴은 `--resume <session_id>`로 같은 세션을 잇는다.
 *   그래서 `--no-session-persistence`를 쓰지 않는다(세션이 저장돼야 이어 받을 수 있다).
 */
import { spawn } from 'node:child_process';

/** 사용자 환경을 차단하는 옵션. 격리 프로브로 검증했다. */
export const ISOLATION_ARGS = ['--setting-sources', '', '--strict-mcp-config'] as const;

/** 닿지 않는 로컬 포트. 이 프록시를 거치는 연결은 바로 거부된다. */
export const BLOCKING_PROXY = 'http://127.0.0.1:9';

/**
 * 프록시를 거치지 않는 호스트. CLI가 API 호출과 OAuth 토큰 갱신에 쓰는 것만 둔다
 * (code.claude.com/docs/en/network-config의 Network access requirements 표).
 * 선택 사항인 원격 측정 호스트(Datadog)는 넣지 않아 차단된다.
 */
export const API_HOSTS = ['api.anthropic.com', 'claude.ai', 'platform.claude.com'] as const;

/**
 * 자식 프로세스 환경에 넣는 네트워크 차단 변수. 대소문자 두 형태를 모두 넣는다.
 * NODE_USE_ENV_PROXY=1이면 에이전트가 띄운 node의 fetch도 이 프록시를 따른다.
 */
export function networkBlockEnv(): Record<string, string> {
  const noProxy = API_HOSTS.join(',');
  return {
    HTTP_PROXY: BLOCKING_PROXY,
    HTTPS_PROXY: BLOCKING_PROXY,
    http_proxy: BLOCKING_PROXY,
    https_proxy: BLOCKING_PROXY,
    NO_PROXY: noProxy,
    no_proxy: noProxy,
    NODE_USE_ENV_PROXY: '1',
  };
}

/** 에이전트에게 허용하는 Bash 명령. 탐색 명령을 포함해 Skill 없는 arm이 불리하지 않게 한다. */
export const ALLOWED_TOOLS = [
  // migrate Skill은 frontmatter의 allowed-tools로 Bash 전체를 승인받는다. 대조 arm에도 같은 권한을
  // 줘야 한다. 파일럿에서 대조 arm만 실행당 6~8건이 거부돼 턴 수가 2~3배로 늘었다.
  // 네트워크로 나가는 명령은 DISALLOWED_TOOLS가 막는다.
  'Bash',
  'Read',
  'Glob',
  'Grep',
  'Edit',
  'Write',
  'Bash(node:*)',
  'Bash(npm run size:*)',
  'Bash(npx tsc:*)',
  'Bash(ls:*)',
  'Bash(cat:*)',
  'Bash(find:*)',
  'Bash(grep:*)',
  'Bash(cd:*)',
  'Bash(pwd:*)',
  'Bash(mkdir:*)',
  // 파일럿에서 `cd ... && ls && echo ---` 같은 복합 명령이 echo 때문에 통째로 거부됐다.
  'Bash(echo:*)',
  'Bash(head:*)',
  'Bash(tail:*)',
  'Bash(wc:*)',
] as const;

/** 네트워크로 나가는 경로와 평가와 무관한 도구. */
export const DISALLOWED_TOOLS = [
  'WebFetch',
  'WebSearch',
  'Bash(curl:*)',
  'Bash(wget:*)',
  'Bash(npm install:*)',
  'Bash(npm i:*)',
  'Bash(npm view:*)',
  'Bash(npm info:*)',
  'Bash(pnpm:*)',
  'Bash(yarn:*)',
  'Bash(git:*)',
] as const;

export interface RunConfig {
  readonly model: string;
  readonly maxTurns: number;
  /** 빈 MCP 설정 파일의 경로. */
  readonly emptyMcpConfig: string;
  /** 로드할 플러그인 폴더. 대조 arm은 null. */
  readonly pluginDir: string | null;
  /** 두 번째 턴에서 이어 받을 세션 ID. 첫 턴은 null. */
  readonly resumeSessionId?: string | null;
}

/** arm 사이의 차이는 --plugin-dir 하나뿐이다. 턴 사이의 차이는 --resume 하나뿐이다. */
export function buildArgs(config: RunConfig): string[] {
  const args = [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--model',
    config.model,
    '--max-turns',
    String(config.maxTurns),
    ...ISOLATION_ARGS,
    '--mcp-config',
    config.emptyMcpConfig,
    '--permission-mode',
    'acceptEdits',
    '--allowedTools',
    ...ALLOWED_TOOLS,
    '--disallowedTools',
    ...DISALLOWED_TOOLS,
  ];
  if (config.resumeSessionId != null) args.push('--resume', config.resumeSessionId);
  if (config.pluginDir !== null) args.push('--plugin-dir', config.pluginDir);
  return args;
}

export interface SpawnOptions {
  /** 실행 파일. 테스트에서는 node로 바꿔 가짜 스크립트를 실행한다. */
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly prompt: string;
  readonly timeoutMs: number;
  /** 부모 환경 위에 덮어쓸 변수. */
  readonly env?: Readonly<Record<string, string>>;
}

export interface SpawnResult {
  readonly stdout: string;
  readonly stderr: string;
  /** 타임아웃으로 종료했으면 null. */
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly durationMs: number;
}

/** 프로세스와 그 자식들을 종료한다. */
function killTree(pid: number): void {
  if (process.platform === 'win32') {
    // child.kill()은 에이전트가 띄운 node, tsc 같은 손자 프로세스를 남긴다.
    spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    // 이미 끝난 프로세스다.
  }
}

export function runProcess(options: SpawnOptions): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    // 중첩 실행을 막는 표시를 지운다. 대화형 터미널 충돌을 막으려는 표시라 하위 프로세스에는 무해하다.
    const env = { ...process.env, ...options.env };
    delete env['CLAUDECODE'];

    const child = spawn(options.command, [...options.args], {
      cwd: options.cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      // POSIX에서 프로세스 그룹을 만들어 그룹 단위로 종료할 수 있게 한다.
      detached: process.platform !== 'win32',
      windowsHide: true,
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let timedOut = false;
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));

    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid !== undefined) killTree(child.pid);
    }, options.timeoutMs);

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        // 바이트를 모은 뒤 한 번에 디코딩한다. 조각 단위로 디코딩하면 한글이 경계에서 깨진다.
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        exitCode: timedOut ? null : code,
        timedOut,
        durationMs: Date.now() - started,
      });
    });

    child.stdin.on('error', () => {
      // 프로세스가 입력을 읽기 전에 끝나면 EPIPE가 난다. 종료 코드로 드러나므로 여기서는 넘긴다.
    });
    child.stdin.end(options.prompt, 'utf8');
  });
}
