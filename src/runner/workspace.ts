/**
 * 실행마다 쓰는 프로젝트 작업 폴더.
 *
 * 1. 고정 사본(fixture)을 새 임시 폴더로 통째로 복사한다. node_modules와 .git도 포함한다.
 *    연결(심볼릭 링크·정션)로 공유하지 않는다. 에이전트가 node_modules를 고치면 다음 실행에 남는다.
 * 2. 실행이 끝나면 base 태그 대비 변경을 changes.patch로 저장한다. node_modules는 패치에 넣지 않는다.
 * 3. 작업 폴더를 지운다. 채점은 새 사본에 패치를 적용해서 따로 한다.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** 고정 사본의 기준 커밋을 가리키는 태그. scripts/prepare-fixtures.ts가 만든다. */
export const BASE_TAG = 'base';

/** robocopy 종료 코드 0~7은 성공(복사·추가 파일 있음 등), 8 이상은 실패다. */
const ROBOCOPY_FAILURE = 8;

/**
 * src를 dest로 복사한다. Windows에서는 robocopy /MIR /MT:16을 쓴다.
 * cpSync는 node_modules(파일 수만 개) 복사가 robocopy보다 몇 배 느리다.
 */
export function copyTree(src: string, dest: string): void {
  if (process.platform === 'win32') {
    const result = spawnSync(
      'robocopy',
      [src, dest, '/MIR', '/MT:16', '/R:1', '/W:1', '/NFL', '/NDL', '/NJH', '/NJS', '/NP'],
      { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
    );
    const code = result.status;
    if (code === null || code >= ROBOCOPY_FAILURE) {
      throw new Error(
        `robocopy ${src} → ${dest} 실패(종료 코드 ${String(code)}): ${result.stdout.toString('utf8').slice(0, 500)}`,
      );
    }
    return;
  }
  cpSync(src, dest, { recursive: true, verbatimSymlinks: true });
}

/** 폴더를 지운다. 걸린 시간(ms)을 돌려준다. */
export function removeTree(dir: string): number {
  const started = Date.now();
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  return Date.now() - started;
}

export interface ProjectWorkspace {
  readonly dir: string;
  /** 고정 사본을 복사하는 데 걸린 시간. */
  readonly copyMs: number;
}

/**
 * 고정 사본을 새 임시 폴더로 복사한다.
 * @param root 임시 폴더를 만들 위치. 기본은 OS 임시 폴더다. 저장소 안이면 안 된다.
 */
export function prepareProjectWorkspace(fixtureDir: string, root = tmpdir()): ProjectWorkspace {
  if (!existsSync(join(fixtureDir, '.git'))) throw new Error(`${fixtureDir}에 .git이 없다`);
  if (!existsSync(join(fixtureDir, 'node_modules'))) {
    throw new Error(`${fixtureDir}에 node_modules가 없다`);
  }
  mkdirSync(root, { recursive: true });
  const dir = mkdtempSync(join(root, 'skill-eval-'));
  const started = Date.now();
  copyTree(fixtureDir, dir);
  return { dir, copyMs: Date.now() - started };
}

function git(ws: string, args: readonly string[]): Buffer {
  return execFileSync(
    'git',
    ['-C', ws, '-c', 'core.autocrlf=false', '-c', 'core.quotepath=false', ...args],
    { maxBuffer: 1024 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
  );
}

/**
 * diff에서 node_modules를 빼는 pathspec. 고정 사본의 info/exclude가 1차로 막고 이것이 2차로 막는다.
 * add에는 쓰지 않는다. 무시된 경로를 pathspec에 적으면 git add가 오류로 끝난다.
 */
const PATHSPEC = ['--', '.', ':(exclude)node_modules', ':(exclude)**/node_modules/**'] as const;

export interface SavedChanges {
  readonly patchBytes: number;
  /** base 대비 바뀐 파일. `<상태>\t<경로>` 형식(git diff --name-status). */
  readonly changedFiles: readonly string[];
}

/**
 * 작업 폴더의 변경(추적되지 않던 새 파일 포함)을 base 태그 대비 바이너리 패치로 저장한다.
 * 에이전트는 git을 쓸 수 없으므로 인덱스는 base 그대로다. 여기서 전부 스테이징한 뒤 비교한다.
 */
export function saveChanges(ws: string, patchFile: string): SavedChanges {
  git(ws, ['add', '-A']);
  const diffArgs = ['diff', '--cached', '--no-ext-diff', '--no-color', BASE_TAG];
  const patch = git(ws, [...diffArgs, '--binary', ...PATHSPEC]);
  const names = git(ws, [...diffArgs, '--name-status', ...PATHSPEC]).toString('utf8');
  writeFileSync(patchFile, patch);
  return {
    patchBytes: patch.byteLength,
    changedFiles: names.split('\n').filter((line) => line.trim() !== ''),
  };
}

function hashFile(path: string): string {
  return existsSync(path) ? createHash('sha256').update(readFileSync(path)).digest('hex') : 'none';
}

/**
 * node_modules를 에이전트가 건드렸는지 싸게 확인하는 지문.
 * es-toolkit·lodash의 package.json 해시와 최상위(스코프는 한 단계 더) 폴더 목록을 합친다.
 * 패키지를 지우거나 버전을 바꾸면 달라진다. 패키지 안의 파일 수정까지는 잡지 못한다.
 */
export function nodeModulesFingerprint(ws: string): string {
  const nm = join(ws, 'node_modules');
  if (!existsSync(nm)) return 'missing';
  const entries: string[] = [];
  for (const name of readdirSync(nm).sort()) {
    entries.push(name);
    if (name.startsWith('@')) {
      for (const sub of readdirSync(join(nm, name)).sort()) entries.push(`${name}/${sub}`);
    }
  }
  return createHash('sha256')
    .update(hashFile(join(nm, 'es-toolkit/package.json')))
    .update(hashFile(join(nm, 'lodash/package.json')))
    .update(entries.join('\n'))
    .digest('hex');
}
