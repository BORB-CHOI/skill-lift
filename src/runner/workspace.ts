/**
 * 에이전트가 작업할 폴더를 실행마다 새로 만든다.
 *
 * 과제의 src/와 미리 설치한 의존성의 사본만 넣는다. 비공개 채점 자료는 넣지 않는다.
 * 의존성은 폴더를 연결하지 않고 복사한다. 연결해 공유하면 에이전트가 node_modules 안에
 * 만든 파일이 다음 실행에 남는다(시험 실행에서 관측).
 */
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';

/**
 * 작업 폴더에 설치하는 패키지와 버전(설계 7절). 버전이 null이면 설치 여부만 확인한다.
 * 의존성 폴더에 다른 패키지(예: esbuild)가 있어도 복사하지 않는다.
 */
export const WORKSPACE_PACKAGES: Readonly<Record<string, string | null>> = {
  lodash: '4.18.1',
  '@types/lodash': null,
  'es-toolkit': '1.53.2',
  typescript: null,
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

function installedVersion(depsNodeModules: string, name: string): string | null {
  const file = join(depsNodeModules, name, 'package.json');
  if (!existsSync(file)) return null;
  const pkg = JSON.parse(readFileSync(file, 'utf8')) as { version?: unknown };
  return typeof pkg.version === 'string' ? pkg.version : null;
}

/**
 * 의존성 폴더에 필요한 패키지가 정해진 버전으로 있는지 확인하고, 실제 버전을 돌려준다.
 * 하나라도 없거나 버전이 다르면 실행 전에 실패한다.
 */
export function verifyDeps(depsNodeModules: string): Record<string, string> {
  const versions: Record<string, string> = {};
  for (const [name, expected] of Object.entries(WORKSPACE_PACKAGES)) {
    const actual = installedVersion(depsNodeModules, name);
    if (actual === null) throw new Error(`${depsNodeModules}에 ${name}이 없다`);
    if (expected !== null && actual !== expected) {
      throw new Error(`${name} 버전이 ${actual}이다. ${expected}이어야 한다`);
    }
    versions[name] = actual;
  }
  return versions;
}

/** node_modules 안의 경로가 설치 대상 패키지(와 그 실행 파일 shim)에 속하는지. */
function isWorkspacePackagePath(depsNodeModules: string, path: string): boolean {
  const rel = relative(depsNodeModules, path).split(sep).join('/');
  if (rel === '' || rel === '.bin' || rel === '@types') return true;
  if (rel.startsWith('.bin/')) {
    // typescript의 tsc·tsserver shim만 남긴다.
    return /^\.bin\/(?:tsc|tsserver)(?:\.cmd|\.ps1)?$/.test(rel);
  }
  return Object.keys(WORKSPACE_PACKAGES).some((name) => rel === name || rel.startsWith(`${name}/`));
}

/**
 * @param taskDir 과제의 공개 폴더. src/만 복사한다.
 * @param depsNodeModules 미리 설치한 의존성의 node_modules 경로
 * @param versions verifyDeps가 돌려준 버전. package.json의 dependencies에 적는다.
 */
export function prepareWorkspace(
  taskDir: string,
  depsNodeModules: string,
  versions: Readonly<Record<string, string>>,
): string {
  const dir = mkdtempSync(join(tmpdir(), 'skill-eval-'));
  cpSync(join(taskDir, 'src'), join(dir, 'src'), { recursive: true });
  // Skill은 "es-toolkit에 의존하는 패키지"에서 확인 명령을 돌리라고 한다. 실제 프로젝트처럼 의존성을 적는다.
  const packageJson = { name: 'fixture', private: true, type: 'module', dependencies: versions };
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
  writeFileSync(join(dir, 'tsconfig.json'), `${JSON.stringify(TSCONFIG, null, 2)}\n`, 'utf8');
  cpSync(depsNodeModules, join(dir, 'node_modules'), {
    recursive: true,
    filter: (source) => isWorkspacePackagePath(depsNodeModules, source),
  });
  return dir;
}

/**
 * 작업 폴더의 산출물을 실행 폴더로 복사한다. 없으면 false를 돌려준다.
 * 바이트를 그대로 복사한다. 줄바꿈 정리는 채점기가 한다.
 */
export function copyArtifact(workspace: string, relPath: string, destination: string): boolean {
  const source = join(workspace, relPath);
  if (!existsSync(source)) return false;
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
  return true;
}
