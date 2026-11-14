/**
 * 실행 기록의 도구 입력을 훑는 검사. 순수 함수다.
 *
 * - 오염 검사(설계 7절): 외부 네트워크에 접근하려 한 도구 입력을 찾는다. 차단돼 실패한 시도도 센다.
 * - 조작 확인(설계 6.4절): Skill 본문이 시키는 확인 행동을 에이전트가 했는지 본다.
 *
 * 도구 출력(파일 내용, 명령 결과)은 보지 않는다. 읽은 파일에 URL이 있는 것은 접근 시도가 아니다.
 */
import type { ToolUse } from './stream.js';

/** 명령을 실행하는 도구. 입력 전체에 모든 네트워크 패턴을 적용한다. */
const COMMAND_TOOLS = new Set(['Bash', 'PowerShell']);

/** 파일을 쓰는 도구. 코드 안의 네트워크 API 호출만 본다. 주석 속 문서 URL은 접근이 아니다. */
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

/** 이름만으로 네트워크 접근인 도구. DISALLOWED_TOOLS로 막지만, 쓰였다면 오염이다. */
const NETWORK_TOOLS = new Set(['WebFetch', 'WebSearch']);

interface Pattern {
  readonly id: string;
  readonly regex: RegExp;
}

/** 작업 폴더에 설치된 실행 파일. 이 이름으로 부르는 npx는 레지스트리에 가지 않는다. */
const LOCAL_NPX_BINS = ['tsc', 'tsserver'];

/** 파일 쓰기 내용에도 적용하는 패턴: 코드가 직접 네트워크를 여는 호출. */
const CODE_PATTERNS: readonly Pattern[] = [
  { id: 'fetch(', regex: /\bfetch\s*\(/ },
  {
    id: 'node:http',
    regex:
      /(?:require\s*\(\s*|import\s*\(\s*|from\s+)['"](?:node:)?(?:http|https|http2|net|tls|dgram)['"]/,
  },
  { id: 'XMLHttpRequest', regex: /\bXMLHttpRequest\b/ },
  { id: 'WebSocket', regex: /\bnew\s+WebSocket\b/ },
];

/** 명령 입력에만 적용하는 패턴. */
const COMMAND_PATTERNS: readonly Pattern[] = [
  ...CODE_PATTERNS,
  { id: 'url', regex: /\bhttps?:\/\//i },
  { id: 'Invoke-WebRequest', regex: /\b(?:Invoke-WebRequest|Invoke-RestMethod|iwr|irm)\b/i },
  { id: 'Net.WebClient', regex: /\bNet\.WebClient\b|\bStart-BitsTransfer\b/i },
  { id: 'curl', regex: /\bcurl(?:\.exe)?\b/i },
  { id: 'wget', regex: /\bwget\b/i },
  { id: 'npm install', regex: /\bnpm\s+(?:install|i|add|ci|exec|view|info)\b/ },
  { id: 'pnpm add', regex: /\bpnpm\s+(?:add|install|i|dlx|exec)\b/ },
  { id: 'yarn add', regex: /\byarn\s+(?:add|install|dlx)\b/ },
  { id: 'bunx', regex: /\bbunx\b|\bbun\s+(?:add|install|x)\b/ },
];

export interface NetworkEvidence {
  /** 1 또는 2. 몇 번째 턴의 기록인지. */
  readonly turn: number;
  readonly tool: string;
  readonly pattern: string;
  /** 일치한 입력의 앞부분(최대 300자). */
  readonly excerpt: string;
}

/** 도구 입력 가운데 문자열 값을 모두 이어 붙인다. */
function inputText(use: ToolUse): string {
  const parts: string[] = [];
  for (const value of Object.values(use.input)) {
    if (typeof value === 'string') parts.push(value);
    else if (Array.isArray(value)) parts.push(JSON.stringify(value));
  }
  return parts.join('\n');
}

/** `npx tsc`처럼 설치된 실행 파일을 부르는 npx는 빼고, 그 밖의 npx 호출을 찾는다. */
function remoteNpx(command: string): boolean {
  const re = /\bnpx\s+((?:-{1,2}[\w-]+\s+)*)([^\s;&|]+)/g;
  for (const match of command.matchAll(re)) {
    const flags = match[1] ?? '';
    const bin = match[2] ?? '';
    if (/--no-install|--offline/.test(flags)) continue;
    if (!LOCAL_NPX_BINS.includes(bin)) return true;
  }
  return false;
}

function excerpt(text: string): string {
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
}

/** 한 턴의 도구 호출에서 네트워크 접근 시도를 모두 찾는다. */
export function scanNetworkAttempts(uses: readonly ToolUse[], turn: number): NetworkEvidence[] {
  const found: NetworkEvidence[] = [];
  for (const use of uses) {
    const text = inputText(use);
    if (NETWORK_TOOLS.has(use.name)) {
      found.push({ turn, tool: use.name, pattern: use.name, excerpt: excerpt(text) });
      continue;
    }
    let patterns: readonly Pattern[];
    if (COMMAND_TOOLS.has(use.name)) patterns = COMMAND_PATTERNS;
    else if (WRITE_TOOLS.has(use.name)) patterns = CODE_PATTERNS;
    else continue;
    for (const { id, regex } of patterns) {
      if (regex.test(text))
        found.push({ turn, tool: use.name, pattern: id, excerpt: excerpt(text) });
    }
    if (COMMAND_TOOLS.has(use.name) && remoteNpx(text)) {
      found.push({ turn, tool: use.name, pattern: 'npx', excerpt: excerpt(text) });
    }
  }
  return found;
}

export interface ManipulationChecks {
  /** Skill의 확인 명령처럼 es-toolkit/package.json을 읽거나 export 목록을 뽑았다. */
  readonly ranAvailabilityCheck: boolean;
  /** Read·Grep·Glob·Bash로 node_modules/es-toolkit 안을 봤다. */
  readonly readEsToolkitSource: boolean;
  /** lodash와 es-toolkit을 함께 불러오는 코드를 실행했다. */
  readonly ranLodashComparison: boolean;
}

const LODASH_IMPORT =
  /(?:require\s*\(\s*|import\s*\(\s*|from\s+)['"](?:lodash|lodash-es)(?:\/[^'"]*)?['"]/;
const ES_TOOLKIT_IMPORT =
  /(?:require\s*\(\s*|import\s*\(\s*|from\s+)['"]es-toolkit(?:\/[^'"]*)?['"]/;
/** 코드를 실행하는 명령. tsc처럼 검사만 하는 명령은 넣지 않는다. */
const RUNS_CODE = /\b(?:node|tsx|ts-node|bun|deno)\b/;

function normalizePath(text: string): string {
  return text.replace(/\\\\/g, '/').replace(/\\/g, '/');
}

function isAvailabilityCheck(command: string): boolean {
  if (/es-toolkit\/package\.json/.test(command)) return true;
  // export 목록 뽑기: es-toolkit 모듈을 불러와 Object.keys나 `in`으로 이름을 확인한다.
  return (
    ES_TOOLKIT_IMPORT.test(command) && /\bObject\.keys\s*\(|['"`]\w+['"`]\s+in\s+\w/.test(command)
  );
}

function fileName(path: string): string {
  return normalizePath(path).split('/').pop() ?? path;
}

/** 두 턴의 도구 호출을 이어서 조작 확인 값을 계산한다. */
export function manipulationChecks(uses: readonly ToolUse[]): ManipulationChecks {
  let ranAvailabilityCheck = false;
  let readEsToolkitSource = false;
  let ranLodashComparison = false;
  // lodash와 es-toolkit을 함께 불러오는 파일. 나중에 실행하면 비교로 센다.
  const comparisonFiles = new Set<string>();

  for (const use of uses) {
    const text = inputText(use);
    const path = normalizePath(text);
    if (['Read', 'Grep', 'Glob', 'Bash', 'PowerShell'].includes(use.name)) {
      if (path.includes('node_modules/es-toolkit')) readEsToolkitSource = true;
    }
    if (use.name === 'Write' || use.name === 'Edit') {
      const target = use.input['file_path'];
      // 과제 파일(module.ts)은 lodash를 남긴 전환 결과일 수 있어서 비교 스크립트로 치지 않는다.
      const name = typeof target === 'string' ? fileName(target) : '';
      if (
        name !== '' &&
        name !== 'module.ts' &&
        LODASH_IMPORT.test(text) &&
        ES_TOOLKIT_IMPORT.test(text)
      ) {
        comparisonFiles.add(name);
      }
      continue;
    }
    if (!COMMAND_TOOLS.has(use.name)) continue;
    if (isAvailabilityCheck(text)) ranAvailabilityCheck = true;
    if (LODASH_IMPORT.test(text) && ES_TOOLKIT_IMPORT.test(text) && RUNS_CODE.test(text)) {
      ranLodashComparison = true;
    }
    if (RUNS_CODE.test(text) && [...comparisonFiles].some((name) => text.includes(name))) {
      ranLodashComparison = true;
    }
  }
  return { ranAvailabilityCheck, readEsToolkitSource, ranLodashComparison };
}
