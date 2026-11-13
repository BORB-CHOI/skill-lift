/**
 * TypeScript 소스 문자열을 실행 가능한 모듈로 읽는다.
 *
 * 채점은 에이전트의 작업 폴더가 아니라 깨끗한 폴더에서 한다. 소스를 임시 파일로 쓰고
 * esbuild로 번들한 뒤 import한다. 타입 오류는 여기서 보지 않는다(typecheck.ts가 본다).
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

export type ModuleExports = Readonly<Record<string, unknown>>;

/**
 * @param code TypeScript 소스
 * @param resolveDir 의존성을 찾을 폴더. 이 아래에 임시 폴더를 만들었다가 지운다.
 */
export async function loadModuleFromSource(
  code: string,
  resolveDir: string,
): Promise<ModuleExports> {
  const dir = join(resolveDir, '.grade-tmp', `load-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  try {
    const entry = join(dir, 'entry.ts');
    const outfile = join(dir, 'entry.mjs');
    writeFileSync(entry, code, 'utf8');
    await build({
      entryPoints: [entry],
      outfile,
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'es2022',
      logLevel: 'silent',
    });
    return (await import(pathToFileURL(outfile).href)) as ModuleExports;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
