/**
 * 과제 점검(설계 문서 10절 채점기 관문의 일부).
 *
 * 과제마다 원본 모듈과 기준 해답을 작업 폴더와 같은 설정으로 타입 검사한다. 기준 해답은 S 항목에
 * strict, D·C 항목에 compat을 쓴 조합이다. 동작 비교는 scripts/gate-grader.ts가 한다.
 *
 * 사용: pnpm tsx scripts/check-tasks.ts
 */
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const tasksDir = join(repoRoot, 'suites/es-toolkit/migrate/tasks');
const sealedDir = process.env.SKILL_EVAL_SEALED ?? join(repoRoot, 'sealed/es-toolkit/migrate-v3');

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

const dir = mkdtempSync(join(tmpdir(), 'check-tasks-'));
try {
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify(TSCONFIG), 'utf8');
  cpSync(join(repoRoot, 'node_modules'), join(dir, 'node_modules'), {
    recursive: true,
    dereference: false,
  });
  let failed = 0;
  for (const id of readdirSync(tasksDir).sort()) {
    rmSync(join(dir, 'src'), { recursive: true, force: true });
    rmSync(join(dir, 'out'), { recursive: true, force: true });
    mkdirSync(join(dir, 'src'));
    mkdirSync(join(dir, 'out'));
    cpSync(join(tasksDir, id, 'src/module.ts'), join(dir, 'src/module.ts'));
    cpSync(join(sealedDir, 'reference', `${id}.ts`), join(dir, 'out/module.ts'));
    try {
      execFileSync(process.execPath, [join(dir, 'node_modules/typescript/bin/tsc'), '-p', dir], {
        stdio: 'pipe',
      });
      console.log(id, 'tsc 통과');
    } catch (error) {
      failed++;
      const out = (error as { stdout?: Buffer }).stdout?.toString() ?? String(error);
      console.log(id, 'tsc 실패\n', out.split('\n').slice(0, 8).join('\n'));
    }
  }
  console.log(failed === 0 ? '모든 과제 통과' : `실패 ${failed}개`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
