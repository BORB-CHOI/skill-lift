/**
 * 네트워크 차단 프로브(설계 7절, 10절의 네트워크 관문).
 *
 * 본 실행과 같은 옵션·환경 변수로 `claude -p`를 한 번 띄워, 에이전트에게 fetch 한 줄을 실행하게 한다.
 * 통과 조건: API 호출이 성공하고(result가 success), 에이전트가 실행한 fetch는 실패한다(NET_BLOCKED).
 * 그 전에 같은 환경 변수로 node를 직접 띄워 fetch가 막히는지도 확인한다(LLM 호출 없음).
 *
 * 사용: pnpm tsx scripts/probe-network.ts [모델=sonnet]
 * 출력: results/probe-network/<시각>.jsonl(실행 기록), 콘솔에 판정
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildArgs, networkBlockEnv, runProcess } from '../src/runner/claude.js';
import { parseTranscript } from '../src/runner/stream.js';

const model = process.argv[2] ?? 'sonnet';
const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const env = networkBlockEnv();

const FETCH_CODE =
  "fetch('https://example.com').then(()=>console.log('NET_OK')).catch(e=>console.log('NET_BLOCKED', e.cause?.code ?? e.message))";
const PROMPT = `Run exactly this shell command once with the Bash tool and then reply with its output and nothing else:\nnode -e "${FETCH_CODE}"`;

/** 1단계: LLM 없이 같은 환경 변수로 node fetch가 막히는지 본다. */
const direct = execFileSync(process.execPath, ['-e', FETCH_CODE], {
  env: { ...process.env, ...env },
  encoding: 'utf8',
}).trim();
console.log(`node 직접 실행: ${direct}`);

/** stream-json 기록에서 도구 결과(tool_result)의 문자열만 모은다. 프롬프트·명령 문자열과 섞이지 않게 한다. */
function toolResults(jsonl: string): string[] {
  const out: string[] = [];
  for (const line of jsonl.split('\n')) {
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    const message = (event as { type?: unknown; message?: { content?: unknown } }).message;
    if ((event as { type?: unknown }).type !== 'user' || !Array.isArray(message?.content)) continue;
    for (const block of message.content as { type?: unknown; content?: unknown }[]) {
      if (block.type !== 'tool_result') continue;
      if (typeof block.content === 'string') out.push(block.content);
      else if (Array.isArray(block.content)) {
        for (const part of block.content as { text?: unknown }[]) {
          if (typeof part.text === 'string') out.push(part.text);
        }
      }
    }
  }
  return out;
}

const workspace = mkdtempSync(join(tmpdir(), 'skill-eval-probe-'));
try {
  const run = await runProcess({
    command: 'claude',
    args: buildArgs({
      model,
      maxTurns: 4,
      emptyMcpConfig: join(repoRoot, '.pilot/empty-mcp.json'),
      pluginDir: null,
    }),
    cwd: workspace,
    prompt: PROMPT,
    timeoutMs: 3 * 60_000,
    env,
  });
  const outDir = join(repoRoot, 'results/probe-network');
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
  writeFileSync(file, run.stdout, 'utf8');

  const transcript = parseTranscript(run.stdout);
  const apiOk = transcript.result?.subtype === 'success' && !transcript.result.isError;
  const results = toolResults(run.stdout).join('\n');
  const fetchBlocked = results.includes('NET_BLOCKED') && !results.includes('NET_OK');
  const bashRan = transcript.toolUses.some((use) => use.name === 'Bash');

  console.log(
    `Claude Code ${transcript.init?.claudeCodeVersion ?? '?'}, 모델 ${transcript.init?.model ?? '?'}`,
  );
  console.log(
    `API 호출: ${apiOk ? '성공' : `실패 (${transcript.result?.subtype ?? 'result 없음'}, 종료 코드 ${String(run.exitCode)})`}`,
  );
  console.log(`에이전트의 Bash 실행: ${bashRan ? '있음' : '없음'}`);
  console.log(`도구 결과: ${results.trim() === '' ? '(없음)' : results.trim()}`);
  console.log(`fetch: ${fetchBlocked ? '차단됨' : '차단 확인 실패'}`);
  console.log(`기록: ${file}`);
  if (run.stderr.trim() !== '') console.log(`stderr: ${run.stderr.trim().slice(0, 500)}`);
  const pass = apiOk && bashRan && fetchBlocked && direct.startsWith('NET_BLOCKED');
  console.log(pass ? '판정: 통과' : '판정: 실패');
  process.exitCode = pass ? 0 : 1;
} finally {
  rmSync(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
}
