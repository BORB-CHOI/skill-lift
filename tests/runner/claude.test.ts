import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API_HOSTS, buildArgs, networkBlockEnv, runProcess } from '../../src/runner/claude.js';

let dir = '';

/** claude 대신 실행할 가짜 스크립트를 만든다. */
function script(name: string, code: string): string {
  const file = join(dir, name);
  writeFileSync(file, code, 'utf8');
  return file;
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'runner-test-'));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('buildArgs', () => {
  const base = { model: 'haiku', maxTurns: 20, emptyMcpConfig: '/tmp/empty.json' };

  it('두 arm의 차이는 --plugin-dir뿐이다', () => {
    const control = buildArgs({ ...base, pluginDir: null });
    const treatment = buildArgs({ ...base, pluginDir: '/tmp/plugin' });
    expect(treatment.slice(0, control.length)).toEqual(control);
    expect(treatment.slice(control.length)).toEqual(['--plugin-dir', '/tmp/plugin']);
  });

  it('사용자 설정을 차단하고 네트워크 명령을 거부한다', () => {
    const args = buildArgs({ ...base, pluginDir: null });
    expect(args[args.indexOf('--setting-sources') + 1]).toBe('');
    expect(args).toContain('--strict-mcp-config');
    // 두 번째 턴이 세션을 이어 받아야 하므로 세션 저장을 끄지 않는다.
    expect(args).not.toContain('--no-session-persistence');
    const denied = args.slice(args.indexOf('--disallowedTools') + 1);
    expect(denied).toEqual(
      expect.arrayContaining(['WebFetch', 'Bash(curl:*)', 'Bash(npm install:*)']),
    );
  });

  it('두 번째 턴은 --resume만 더한다', () => {
    const first = buildArgs({ ...base, pluginDir: '/tmp/plugin' });
    const second = buildArgs({ ...base, pluginDir: '/tmp/plugin', resumeSessionId: 'abc' });
    expect(second.filter((a) => a !== '--resume' && a !== 'abc')).toEqual(first);
    expect(second[second.indexOf('--resume') + 1]).toBe('abc');
  });
});

describe('networkBlockEnv', () => {
  it('닿지 않는 프록시를 걸고 API 호스트만 뺀다', () => {
    const env = networkBlockEnv();
    for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy']) {
      expect(env[key]).toBe('http://127.0.0.1:9');
    }
    expect(env['NODE_USE_ENV_PROXY']).toBe('1');
    expect(env['NO_PROXY']?.split(',')).toEqual([...API_HOSTS]);
    expect(env['no_proxy']).toBe(env['NO_PROXY']);
  });
});

describe('runProcess', () => {
  it('지정한 환경 변수를 자식 프로세스에 넘긴다', async () => {
    const show = script('env.mjs', `process.stdout.write(process.env.SKILL_EVAL_PROBE ?? 'none');`);
    const r = await runProcess({
      command: process.execPath,
      args: [show],
      cwd: dir,
      prompt: '',
      timeoutMs: 10_000,
      env: { SKILL_EVAL_PROBE: 'yes' },
    });
    expect(r.stdout).toBe('yes');
  });

  it('stdin으로 받은 한글 프롬프트와 출력이 깨지지 않는다', async () => {
    const echo = script(
      'echo.mjs',
      `let s = ''; process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (s += c));
process.stdin.on('end', () => process.stdout.write(JSON.stringify({ got: s }) + '\\n'));`,
    );
    const prompt = '이 파일의 lodash 사용을 es-toolkit으로 옮겨라 — 번들 크기 축소';
    const r = await runProcess({
      command: process.execPath,
      args: [echo],
      cwd: dir,
      prompt,
      timeoutMs: 10_000,
    });
    expect(r.timedOut).toBe(false);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ got: prompt });
  });

  it('종료 코드와 stderr를 돌려준다', async () => {
    const fail = script('fail.mjs', `process.stderr.write('boom'); process.exit(3);`);
    const r = await runProcess({
      command: process.execPath,
      args: [fail],
      cwd: dir,
      prompt: '',
      timeoutMs: 10_000,
    });
    expect(r.exitCode).toBe(3);
    expect(r.stderr).toBe('boom');
  });

  it('타임아웃이 지나면 자식 프로세스까지 종료한다', async () => {
    const marker = join(dir, 'grandchild-alive.txt');
    // 손자 프로세스가 3초 뒤에 파일을 쓴다. 트리 종료가 되면 파일이 생기지 않는다.
    const grandchild = script(
      'grandchild.mjs',
      `import { writeFileSync } from 'node:fs';
setTimeout(() => writeFileSync(${JSON.stringify(marker)}, 'alive'), 3000);`,
    );
    const hang = script(
      'hang.mjs',
      `import { spawn } from 'node:child_process';
spawn(process.execPath, [${JSON.stringify(grandchild)}], { stdio: 'ignore' });
setInterval(() => {}, 1000);`,
    );
    const r = await runProcess({
      command: process.execPath,
      args: [hang],
      cwd: dir,
      prompt: '',
      timeoutMs: 800,
    });
    expect(r.timedOut).toBe(true);
    expect(r.exitCode).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 3500));
    const { existsSync } = await import('node:fs');
    expect(existsSync(marker)).toBe(false);
  }, 15_000);

  it('실행 파일이 없으면 거부한다', async () => {
    await expect(
      runProcess({
        command: join(dir, 'no-such-binary'),
        args: [],
        cwd: dir,
        prompt: '',
        timeoutMs: 1000,
      }),
    ).rejects.toThrow();
  });
});
