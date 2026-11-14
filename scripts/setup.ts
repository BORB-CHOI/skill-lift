/**
 * 본 실행에 필요한 로컬 준비물을 만든다.
 *
 * - .pilot/deps/node_modules: 에이전트 작업 폴더에 복사할 과제 의존성. 버전은 사전 등록과 같다.
 *   에이전트가 실행 중에 설치하지 않도록 미리 설치해 둔다.
 * - .pilot/empty-mcp.json: --strict-mcp-config와 함께 넘기는 빈 MCP 설정
 *
 * 사용: pnpm eval:setup
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 사전 등록(preregistration.json)의 environment와 같아야 한다. */
const FIXTURE_DEPENDENCIES = [
  'es-toolkit@1.53.2',
  'lodash@4.18.1',
  '@types/lodash@4.17.27',
  'typescript@5.9.3',
  'esbuild@0.28.2',
];

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const pilotDir = join(repoRoot, '.pilot');
const depsDir = join(pilotDir, 'deps');
mkdirSync(depsDir, { recursive: true });
writeFileSync(
  join(depsDir, 'package.json'),
  `${JSON.stringify({ name: 'fixture-deps', private: true }, null, 2)}\n`,
  'utf8',
);
writeFileSync(join(pilotDir, 'empty-mcp.json'), '{"mcpServers":{}}\n', 'utf8');

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
execFileSync(npm, ['install', '--no-audit', '--no-fund', ...FIXTURE_DEPENDENCIES], {
  cwd: depsDir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
console.log(`준비 완료: ${depsDir}`);
