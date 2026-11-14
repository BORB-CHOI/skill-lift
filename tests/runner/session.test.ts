import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runTwoTurns } from '../../src/runner/session.js';

let root = '';
let fake = '';

/**
 * claude 대신 실행하는 가짜 스크립트. FAKE_MODE로 동작을 고른다.
 * - ok: 첫 턴은 out/module.ts, 두 번째 턴(--resume)은 보고서를 쓴다.
 * - limit: 첫 턴이 턴 한도로 끝난다.
 * - net: 첫 턴에서 curl을 시도한다.
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
  const resume = args.includes('--resume') ? args[args.indexOf('--resume') + 1] : null;
  appendFileSync('calls.log', JSON.stringify({ resume, prompt: prompt.slice(0, 40), proxy: process.env.HTTPS_PROXY }) + '\\n');
  const out = (e) => process.stdout.write(JSON.stringify(e) + '\\n');
  const skills = args.includes('--plugin-dir') ? ['es-toolkit:migrate'] : ['verify'];
  out({ type: 'system', subtype: 'init', session_id: 'sess-1', claude_code_version: '9.9.9', model: 'claude-sonnet-5-5', skills });
  const command = mode === 'net' && !resume ? 'curl https://example.com' : 'ls';
  out({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command } }] } });
  mkdirSync('out', { recursive: true });
  if (resume) writeFileSync('out/migration-report.json', '{"functions":[]}');
  else writeFileSync('out/module.ts', 'export {};');
  const subtype = mode === 'limit' && !resume ? 'error_max_turns' : 'success';
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
  const runDir = join(root, `run-${mode}-${String(Date.now())}`);
  mkdirSync(runDir);
  const result = await runTwoTurns({
    command: process.execPath,
    commandPrefixArgs: [fake],
    workspace,
    runDir,
    prefix: pluginDir === null ? '' : '/es-toolkit:migrate ',
    config: { model: 'sonnet', maxTurns: 5, emptyMcpConfig: 'x.json', pluginDir },
    expectation: { expectedSkill, targetPrefix: 'es-toolkit:' },
    timeoutMs: 10_000,
    env: { FAKE_MODE: mode, HTTPS_PROXY: 'http://127.0.0.1:9' },
  });
  const calls = readFileSync(join(workspace, 'calls.log'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as { resume: string | null; prompt: string; proxy: string });
  return { result, calls, runDir };
}

describe('runTwoTurns', () => {
  it('첫 턴의 세션을 이어 두 번째 턴을 돌리고 두 산출물을 복사한다', async () => {
    const { result, calls, runDir } = await run('ok', '/tmp/plugin', 'es-toolkit:migrate');
    expect(result.state).toBe('completed');
    expect(calls.map((c) => c.resume)).toEqual([null, 'sess-1']);
    expect(calls[0]?.prompt.startsWith('/es-toolkit:migrate Convert the lodash')).toBe(true);
    expect(calls[1]?.prompt.startsWith('Write out/migration-report.json')).toBe(true);
    expect(calls.every((c) => c.proxy === 'http://127.0.0.1:9')).toBe(true);
    expect(readFileSync(join(runDir, 'submission.ts'), 'utf8')).toBe('export {};');
    expect(existsSync(join(runDir, 'report.json'))).toBe(true);
    expect(result.transcripts).toHaveLength(2);
    expect(result.turns.map((t) => t.numTurns)).toEqual([3, 3]);
    expect(result.turns[0]?.usage).toEqual({ input: 1, output: 2, cacheRead: 3, cacheCreation: 4 });
    expect(result.sessionId).toBe('sess-1');
    expect(result.claudeVersion).toBe('9.9.9');
    expect(result.loadedSkills).toEqual(['es-toolkit:migrate']);
  });

  it('첫 턴이 한도에 걸리면 두 번째 턴 없이 limit다', async () => {
    const { result, calls, runDir } = await run('limit', null, null);
    expect(result.state).toBe('limit');
    expect(calls).toHaveLength(1);
    expect(result.turns).toHaveLength(1);
    expect(result.report).toBe(false);
    expect(existsSync(join(runDir, 'report.json'))).toBe(false);
  });

  it('네트워크 접근 시도가 있으면 contaminated이고 증거를 남긴다', async () => {
    const { result } = await run('net', null, null);
    expect(result.state).toBe('contaminated');
    expect(result.networkAttempts.map((e) => e.pattern)).toEqual(['url', 'curl']);
  });
});
