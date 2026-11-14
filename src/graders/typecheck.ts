/**
 * 타입 검사 채점기.
 *
 * 제출물을 깨끗한 폴더에서 고정한 컴파일러 옵션으로 검사한다. 에이전트가 자기 작업 폴더의
 * tsconfig를 완화해도 영향이 없다. 타입 검사를 우회하는 주석과 새로 들어온 any는 실패로 친다.
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

export interface TypeCheckResult {
  readonly passed: boolean;
  /** 컴파일러 진단 메시지. */
  readonly diagnostics: readonly string[];
  /** 발견한 우회 수단. */
  readonly bypasses: readonly string[];
}

/** 사전 등록 대상. */
export const COMPILER_OPTIONS: ts.CompilerOptions = {
  strict: true,
  noEmit: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  esModuleInterop: true,
  skipLibCheck: true,
  types: [],
};

const SUPPRESSION = /@ts-(?:ignore|expect-error|nocheck)/g;
/** 타입 위치의 any: `: any`, `as any`, `<any>`, `any[]`. */
const EXPLICIT_ANY = /(?::\s*any\b|\bas\s+any\b|<\s*any\s*>|\bany\s*\[\])/g;

function count(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

/** 원본에 없던 우회 수단을 찾는다. */
export function findBypasses(original: string, submission: string): string[] {
  const found: string[] = [];
  if (count(submission, SUPPRESSION) > count(original, SUPPRESSION)) {
    found.push('타입 검사를 끄는 주석(@ts-ignore, @ts-expect-error, @ts-nocheck)');
  }
  if (count(submission, EXPLICIT_ANY) > count(original, EXPLICIT_ANY)) {
    found.push('새로 들어온 any');
  }
  return found;
}

/**
 * @param submission 제출된 TypeScript 소스
 * @param original 원본 소스. 우회 수단이 새로 들어왔는지 비교하는 데 쓴다.
 * @param resolveDir 의존성과 타입 선언을 찾을 폴더
 */
export function typeCheck(
  submission: string,
  original: string,
  resolveDir: string,
): TypeCheckResult {
  const dir = join(resolveDir, '.grade-tmp', `typecheck-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  try {
    const file = join(dir, 'submission.ts');
    writeFileSync(file, submission, 'utf8');
    const program = ts.createProgram([file], COMPILER_OPTIONS);
    const diagnostics = ts
      .getPreEmitDiagnostics(program)
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    const bypasses = findBypasses(original, submission);
    return { passed: diagnostics.length === 0 && bypasses.length === 0, diagnostics, bypasses };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
