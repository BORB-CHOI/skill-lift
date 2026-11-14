import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runProjectSession } from '../../src/runner/session.js';

let root = '';
let fake = '';

/**
 * claude 대신 실행하는 가짜 스크립트. FAKE_MODE로 동작을 고른다.
 * - ok: src/a.ts를 고치고 정상 종료한다.
 * - limit: 턴 한도로 끝난다.
 * - net: curl을 시도한다(프록시가 막는 시도).
 * - bypass: PowerShell Invoke-WebRequest를 시도한다(프록시를 우회할 수 있는 시도).
 * 받은 인자와 프롬프트를 calls.log에 남긴다.
 */
const FAKE = `
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
const mode = process.env.FAKE_MODE;
let prompt = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (prompt += c));
process.stdin.on('end', () => {
  appendFileSync('calls.log', JSON.stringify({ resume: args.includes('--resume'), prompt, proxy: process.env.HTTPS_PROXY }) + '\\n');
  const out = (e) => process.stdout.write(JSON.stringify(e) + '\\n');
  const skills = args.includes('--plugin-dir') ? ['es-toolkit:migrate'] : ['verify'];
  out({ type: 'system', subtype: 'init', session_id: 'sess-1', claude_code_version: '9.9.9', model: 'claude-haiku-5-5', skills });
  const command = mode === 'net' ? 'curl https://example.com'
    : mode === 'bypass' ? 'powershell -c "Invoke-WebRequest example.com"'
    : 'cat node_modules/es-toolkit/package.json';
  out({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command } }] } });
  mkdirSync('src', { recursive: true });
  writeFileSync('src/a.ts', 'export {};');
  const subtype = mode === 'limit' ? 'error_max_turns' : 'success';
  out({ type: 'result', subtype, is_error: subtype !== 'success', session_id: 'sess-1', num_turns: 3,
    usage: { input_tokens: 1, output_tokens: 2, cache_read_input_tokens: 3, cache_creation_input_tokens: 4 } });
});
`;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'session-test-'));
  fake = join(root, 'fake-claude.mjs');
  writeFileSync(fake, FAKE, 'utf8');
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

async function run(mode: string, pluginDir: string | null, expectedSkill: string | null) {
  const workspace = mkdtempSync(join(root, 'ws-'));
  const result = await runProjectSession({
    command: process.execPath,
    commandPrefixArgs: [fake],
    workspace,
    prefix: pluginDir === null ? '' : '/es-toolkit:migrate ',
    config: { model: 'claude-haiku-5-5', maxTurns: 5, emptyMcpConfig: 'x.json', pluginDir },
    expectation: { expectedSkill, targetPrefix: 'es-toolkit:' },
    timeoutMs: 10_000,
    env: { FAKE_MODE: mode, HTTPS_PROXY: 'http://127.0.0.1:9' },
  });
  const calls = readFileSync(join(workspace, 'calls.log'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as { resume: boolean; prompt: string; proxy: string });
  return { result, calls, workspace };
}

describe('runProjectSession', () => {
  it('한 턴만 실행하고 실행 기록을 돌려준다', async () => {
    const { result, calls, workspace } = await run('ok', '/tmp/plugin', 'es-toolkit:migrate');
    expect(result.state).toBe('completed');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.resume).toBe(false);
    expect(calls[0]?.prompt.startsWith('/es-toolkit:migrate Migrate this project')).toBe(true);
    expect(calls[0]?.proxy).toBe('http://127.0.0.1:9');
    expect(readFileSync(join(workspace, 'src/a.ts'), 'utf8')).toBe('export {};');
    expect(result.turn.numTurns).toBe(3);
    expect(result.turn.usage).toEqual({ input: 1, output: 2, cacheRead: 3, cacheCreation: 4 });
    expect(result.sessionId).toBe('sess-1');
    expect(result.claudeVersion).toBe('9.9.9');
    expect(result.loadedSkills).toEqual(['es-toolkit:migrate']);
    expect(result.checks.ranAvailabilityCheck).toBe(true);
    expect(result.transcript.split('\n').filter((l) => l !== '')).toHaveLength(3);
  });

  it('baseline은 접두 없이 지시문만 받는다', async () => {
    const { calls } = await run('ok', null, null);
    expect(calls[0]?.prompt.startsWith('Migrate this project')).toBe(true);
  });

  it('턴 한도에 걸리면 limit다', async () => {
    const { result } = await run('limit', null, null);
    expect(result.state).toBe('limit');
  });

  it('프록시가 막는 접근 시도는 증거만 남기고 상태는 completed다', async () => {
    const { result } = await run('net', null, null);
    expect(result.state).toBe('completed');
    expect(result.networkAttempts.map((e) => e.pattern)).toEqual(['url', 'curl']);
    expect(result.networkAttempts.every((e) => !e.bypassesProxy)).toBe(true);
  });

  it('프록시를 우회할 수 있는 시도가 있으면 contaminated다', async () => {
    const { result } = await run('bypass', null, null);
    expect(result.state).toBe('contaminated');
    expect(result.networkAttempts.filter((e) => e.bypassesProxy).map((e) => e.pattern)).toEqual([
      'Invoke-WebRequest',
    ]);
  });
});
