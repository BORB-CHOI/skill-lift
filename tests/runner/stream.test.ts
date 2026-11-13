import { describe, expect, it } from 'vitest';
import { parseTranscript } from '../../src/runner/stream.js';

/** 0단계 실측에서 캡처한 출력의 구조를 따라 만든 기록. 경로와 식별자는 지어낸 값이다. */
function lines(...events: unknown[]): string {
  return events.map((e) => JSON.stringify(e)).join('\n');
}

const init = {
  type: 'system',
  subtype: 'init',
  model: 'claude-haiku-5-5',
  permissionMode: 'default',
  tools: ['Bash', 'Read', 'Write', 'Skill'],
  skills: ['es-toolkit:migrate', 'verify'],
  plugins: [{ name: 'es-toolkit', path: '/tmp/plugin' }, { name: 'cc-plugin-telemetry' }],
  mcp_servers: [],
  slash_commands: ['es-toolkit:migrate'],
};

const bashUse = {
  type: 'assistant',
  message: {
    content: [
      { type: 'text', text: '설치된 버전을 확인한다.' },
      { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'node -e "1"' } },
    ],
  },
};

const writeUse = {
  type: 'assistant',
  message: {
    content: [{ type: 'tool_use', id: 't2', name: 'Write', input: { file_path: 'out/a.ts' } }],
  },
};

const result = {
  type: 'result',
  subtype: 'success',
  is_error: false,
  num_turns: 4,
  duration_ms: 12000,
  usage: {
    input_tokens: 4,
    output_tokens: 1331,
    cache_read_input_tokens: 40646,
    cache_creation_input_tokens: 41330,
  },
  permission_denials: [
    { tool_name: 'Write', tool_use_id: 't2', tool_input: { file_path: 'out/a.ts', content: 'x' } },
  ],
};

describe('parseTranscript', () => {
  it('init 메시지에서 로드 목록을 읽는다', () => {
    const t = parseTranscript(lines(init, result));
    expect(t.init?.skills).toEqual(['es-toolkit:migrate', 'verify']);
    expect(t.init?.plugins).toEqual(['es-toolkit', 'cc-plugin-telemetry']);
    expect(t.init?.mcpServers).toEqual([]);
    expect(t.init?.permissionMode).toBe('default');
  });

  it('도구 호출을 순서대로 모은다', () => {
    const t = parseTranscript(lines(init, bashUse, writeUse, result));
    expect(t.toolUses.map((u) => u.name)).toEqual(['Bash', 'Write']);
    expect(t.toolUses[0]?.input).toEqual({ command: 'node -e "1"' });
  });

  it('토큰을 종류별로 나눠 읽는다', () => {
    const t = parseTranscript(lines(init, result));
    expect(t.result?.usage).toEqual({
      input: 4,
      output: 1331,
      cacheRead: 40646,
      cacheCreation: 41330,
    });
    expect(t.result?.numTurns).toBe(4);
  });

  it('거부된 도구 호출을 입력과 함께 읽는다', () => {
    const t = parseTranscript(lines(init, writeUse, result));
    expect(t.result?.deniedTools).toEqual([
      { name: 'Write', input: { file_path: 'out/a.ts', content: 'x' } },
    ]);
  });

  it('result 메시지가 없는 잘린 기록은 result를 null로 둔다', () => {
    const t = parseTranscript(lines(init, bashUse));
    expect(t.result).toBeNull();
    expect(t.toolUses).toHaveLength(1);
  });

  it('JSON이 아닌 줄을 세고 나머지는 계속 읽는다', () => {
    const t = parseTranscript(`${JSON.stringify(init)}\n{"type":"assis\n${JSON.stringify(result)}`);
    expect(t.malformedLines).toBe(1);
    expect(t.init).not.toBeNull();
    expect(t.result?.subtype).toBe('success');
  });

  it('BOM과 CRLF가 있는 Windows 기록을 읽는다', () => {
    const t = parseTranscript(
      `${String.fromCharCode(0xfeff)}${JSON.stringify(init)}\r\n${JSON.stringify(result)}\r\n`,
    );
    expect(t.malformedLines).toBe(0);
    expect(t.init?.model).toBe('claude-haiku-5-5');
  });

  it('턴 한도 초과를 오류로 읽는다', () => {
    const t = parseTranscript(lines({ ...result, subtype: 'error_max_turns', is_error: true }));
    expect(t.result?.subtype).toBe('error_max_turns');
    expect(t.result?.isError).toBe(true);
  });
});
