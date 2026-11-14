/**
 * 에이전트가 작업할 폴더를 실행마다 새로 만든다.
 *
 * 과제의 소스, 번들 크기 측정 스크립트, 미리 설치한 의존성의 사본이 들어간다.
 * 비공개 채점 자료는 넣지 않는다. 의존성은 폴더를 연결하지 않고 복사한다. 연결해 공유하면
 * 에이전트가 node_modules 안에 만든 파일이 다음 실행에 남는다(시험 실행에서 관측).
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** 에이전트가 번들 크기와 자기 코드의 바이트를 직접 확인하는 스크립트. 채점기와 옵션이 같다. */
export const SIZE_SCRIPT = `import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
const file = process.argv[2] ?? 'src/module.ts';
const r = await build({ entryPoints: [file], bundle: true, minify: true, treeShaking: true,
  format: 'esm', platform: 'browser', target: 'es2022', write: false, metafile: true, logLevel: 'silent' });
const own = Object.entries(Object.values(r.metafile.outputs)[0].inputs)
  .filter(([path]) => !path.includes('node_modules/'))
  .reduce((sum, [, info]) => sum + info.bytesInOutput, 0);
console.log(file, gzipSync(r.outputFiles[0].contents, { level: 9 }).byteLength, 'bytes (min+gzip),', own, 'bytes of own code');
`;

const PACKAGE_JSON = {
  name: 'fixture',
  private: true,
  type: 'module',
  scripts: { size: 'node tools/size.mjs' },
};

const TSCONFIG = {
  compilerOptions: {
    strict: true,
    noEmit: true,
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'Bundler',
    esModuleInterop: true,
    skipLibCheck: true,
    types: [],
  },
  include: ['src', 'out'],
};

/**
 * @param taskDir 과제의 공개 폴더. src/만 복사한다.
 * @param depsNodeModules 미리 설치한 의존성의 node_modules 경로
 */
export function prepareWorkspace(taskDir: string, depsNodeModules: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'skill-eval-'));
  cpSync(join(taskDir, 'src'), join(dir, 'src'), { recursive: true });
  mkdirSync(join(dir, 'tools'));
  writeFileSync(join(dir, 'tools/size.mjs'), SIZE_SCRIPT, 'utf8');
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify(PACKAGE_JSON, null, 2)}\n`, 'utf8');
  writeFileSync(join(dir, 'tsconfig.json'), `${JSON.stringify(TSCONFIG, null, 2)}\n`, 'utf8');
  cpSync(depsNodeModules, join(dir, 'node_modules'), { recursive: true });
  return dir;
}

export interface Submission {
  /** out: out/ 파일을 냈다. src: 원본 파일을 직접 고쳤다. original: 아무것도 바꾸지 않았다. */
  readonly kind: 'out' | 'src' | 'original';
  readonly code: string;
}

/**
 * 산출물 규칙: out/ 파일이 있으면 그것, 없고 원본 파일이 바뀌었으면 그것, 아니면 원본 제출.
 * 원본을 그대로 두는 것이 정답인 과제가 있으므로 "바꾸지 않음"을 미제출로 치지 않는다.
 */
export function collectSubmission(
  workspace: string,
  file: string,
  originalSource: string,
): Submission {
  const read = (path: string): string => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  const name = file.split('/').pop() ?? file;
  const out = join(workspace, 'out', name);
  if (existsSync(out)) return { kind: 'out', code: read(out) };
  const inPlace = read(join(workspace, file));
  return inPlace === originalSource
    ? { kind: 'original', code: originalSource }
    : { kind: 'src', code: inPlace };
}

/** 과제 문장. 모든 arm에서 글자 단위로 같다. 처리 arm은 이 앞에 슬래시 명령만 붙인다. */
export function buildTaskPrompt(
  file: string,
  inputRange: string,
  examples: readonly {
    readonly name: string;
    readonly examples: readonly (readonly unknown[])[];
  }[],
): string {
  const name = file.split('/').pop() ?? file;
  const exampleLines = examples
    .map((e) => `${e.name}: ${e.examples.map((args) => JSON.stringify(args)).join(' ; ')}`)
    .join('\n');
  return `Migrate the lodash usage in ${file} to es-toolkit. Keep the exported function signatures and the existing behaviour. Put the result in a single file and do not create other source files. The goal is to reduce bundle size while relying on a maintained library. Use es-toolkit functions and do not hand-write replacements for the utilities; keep a lodash import only when no es-toolkit function preserves the behaviour, and add at most a small adapter around a library call when the call shape differs. Grading checks (1) that results equal the original for inputs within the input range below, (2) that type checking passes, (3) that the bundle size printed by \`npm run size -- <file>\` is close to the smallest size reachable with library functions, and (4) that the bytes of your own code in the bundle, also printed by that command, stay within a small allowance over the original. Do not install anything. Write the whole migrated file to out/${name}.

Input range: ${inputRange}

Example inputs (argument lists):
${exampleLines}`;
}
