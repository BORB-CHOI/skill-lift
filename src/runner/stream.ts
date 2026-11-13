/**
 * `claude -p --output-format stream-json --verbose` 출력(JSONL)을 실행 기록으로 읽는다.
 *
 * 순수 함수다. 프로세스 실행과 분리해 두면 저장된 기록만으로 채점과 재계산을 할 수 있고
 * CI에서 LLM 없이 검증된다.
 *
 * 0단계 실측(Claude Code 2.1.316)에서 확인한 사실:
 * - 첫 system/init 메시지에 로드된 skills, plugins, tools, mcp_servers가 들어 있다.
 * - 슬래시 명령으로 확장된 사용자 메시지는 출력에 나오지 않는다.
 * - 거부된 도구 호출은 result 메시지의 permission_denials에 입력과 함께 남는다.
 */

export interface InitInfo {
  readonly model: string | null;
  readonly permissionMode: string | null;
  readonly tools: readonly string[];
  readonly skills: readonly string[];
  readonly plugins: readonly string[];
  readonly mcpServers: readonly string[];
  readonly slashCommands: readonly string[];
}

export interface ToolUse {
  readonly name: string;
  readonly input: Readonly<Record<string, unknown>>;
}

export interface TokenUsage {
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheCreation: number;
}

export interface ResultInfo {
  readonly subtype: string;
  readonly isError: boolean;
  readonly numTurns: number;
  readonly durationMs: number;
  readonly usage: TokenUsage;
  readonly deniedTools: readonly ToolUse[];
}

export interface Transcript {
  readonly init: InitInfo | null;
  readonly toolUses: readonly ToolUse[];
  readonly result: ResultInfo | null;
  /** JSON으로 읽히지 않은 줄 수. 0이 아니면 기록이 잘렸거나 섞였다는 신호다. */
  readonly malformedLines: number;
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** 문자열 배열, 또는 name 필드가 있는 객체 배열에서 이름 목록을 뽑는다. */
function names(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === 'string') {
      out.push(item);
    } else if (isObject(item)) {
      const name = asString(item['name']);
      if (name !== null) out.push(name);
    }
  }
  return out;
}

function toToolUse(value: unknown, nameKey: string, inputKey: string): ToolUse | null {
  if (!isObject(value)) return null;
  const name = asString(value[nameKey]);
  if (name === null) return null;
  const input = value[inputKey];
  return { name, input: isObject(input) ? input : {} };
}

function parseInit(event: Json): InitInfo {
  return {
    model: asString(event['model']),
    permissionMode: asString(event['permissionMode']),
    tools: names(event['tools']),
    skills: names(event['skills']),
    plugins: names(event['plugins']),
    mcpServers: names(event['mcp_servers']),
    slashCommands: names(event['slash_commands']),
  };
}

function parseResult(event: Json): ResultInfo {
  const usage = isObject(event['usage']) ? event['usage'] : {};
  const denials = Array.isArray(event['permission_denials']) ? event['permission_denials'] : [];
  const deniedTools: ToolUse[] = [];
  for (const denial of denials) {
    const use = toToolUse(denial, 'tool_name', 'tool_input');
    if (use !== null) deniedTools.push(use);
  }
  return {
    subtype: asString(event['subtype']) ?? 'unknown',
    isError: event['is_error'] === true,
    numTurns: asNumber(event['num_turns']),
    durationMs: asNumber(event['duration_ms']),
    usage: {
      input: asNumber(usage['input_tokens']),
      output: asNumber(usage['output_tokens']),
      cacheRead: asNumber(usage['cache_read_input_tokens']),
      cacheCreation: asNumber(usage['cache_creation_input_tokens']),
    },
    deniedTools,
  };
}

function collectToolUses(event: Json, into: ToolUse[]): void {
  const message = event['message'];
  if (!isObject(message) || !Array.isArray(message['content'])) return;
  for (const block of message['content']) {
    if (!isObject(block) || block['type'] !== 'tool_use') continue;
    const use = toToolUse(block, 'name', 'input');
    if (use !== null) into.push(use);
  }
}

/** Windows 도구가 파일 앞에 붙이는 바이트 순서 표시(U+FEFF). */
const BOM = String.fromCharCode(0xfeff);

function stripBom(line: string): string {
  return line.startsWith(BOM) ? line.slice(BOM.length) : line;
}

export function parseTranscript(jsonl: string): Transcript {
  let init: InitInfo | null = null;
  let result: ResultInfo | null = null;
  const toolUses: ToolUse[] = [];
  let malformedLines = 0;

  for (const rawLine of jsonl.split('\n')) {
    // Windows에서 저장한 기록의 BOM과 CR을 걷어 낸다.
    const line = stripBom(rawLine).trim();
    if (line === '') continue;

    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      malformedLines++;
      continue;
    }
    if (!isObject(event)) {
      malformedLines++;
      continue;
    }

    const type = event['type'];
    if (type === 'system' && event['subtype'] === 'init') {
      init ??= parseInit(event);
    } else if (type === 'assistant') {
      collectToolUses(event, toolUses);
    } else if (type === 'result') {
      result = parseResult(event);
    }
  }

  return { init, toolUses, result, malformedLines };
}
