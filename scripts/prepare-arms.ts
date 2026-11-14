/**
 * arm별 플러그인 폴더를 만든다. 폴더마다 migrate Skill 하나만 들어 있다.
 *
 * 공식 Skill은 서브모듈의 Git 객체에서 읽는다. 작업 폴더의 파일은 Git 설정에 따라 줄바꿈이
 * CRLF로 바뀌어 있을 수 있어서 바이트가 운영체제마다 달라진다. 변형 arm은 공식 Skill의
 * frontmatter를 그대로 두고 본문만 바꾼다. 이름과 설명이 같아야 호출 형식과 Skill 목록이 같다.
 *
 * 사용: pnpm tsx scripts/prepare-arms.ts
 * 출력: .arms/<arm>/ 와 .arms/manifest.json (arm별 SKILL.md의 SHA-256)
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const submodule = join(repoRoot, 'vendor/es-toolkit');
const variantsDir = join(repoRoot, 'suites/es-toolkit/migrate/arms');
const outRoot = join(repoRoot, '.arms');

function gitShow(path: string): string {
  return execFileSync('git', ['-C', submodule, 'show', `HEAD:${path}`], { encoding: 'utf8' });
}

const commit = execFileSync('git', ['-C', submodule, 'rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();
const official = gitShow('es-toolkit-plugin/skills/migrate/SKILL.md');
const pluginJson = gitShow('es-toolkit-plugin/.claude-plugin/plugin.json');

const match = /^---\n[\s\S]*?\n---\n/.exec(official);
if (match === null) throw new Error('공식 SKILL.md에서 frontmatter를 찾지 못했다');
const frontmatter = match[0];

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

rmSync(outRoot, { recursive: true, force: true });
const manifest: Record<string, { sha256: string; bytes: number }> = {};
function emit(arm: string, skill: string): void {
  const dir = join(outRoot, arm);
  mkdirSync(join(dir, '.claude-plugin'), { recursive: true });
  mkdirSync(join(dir, 'skills/migrate'), { recursive: true });
  writeFileSync(join(dir, '.claude-plugin/plugin.json'), pluginJson, 'utf8');
  writeFileSync(join(dir, 'skills/migrate/SKILL.md'), skill, 'utf8');
  manifest[arm] = { sha256: sha256(skill), bytes: Buffer.byteLength(skill, 'utf8') };
}

emit('skill', official);
for (const arm of ['placebo', 'procedure', 'sabotage']) {
  const body = readFileSync(join(variantsDir, `${arm}.md`), 'utf8').replace(/\r\n/g, '\n');
  emit(arm, `${frontmatter}\n${body}`);
}

writeFileSync(
  join(outRoot, 'manifest.json'),
  `${JSON.stringify({ source: 'toss/es-toolkit', commit, arms: manifest }, null, 2)}\n`,
  'utf8',
);
console.log(`toss/es-toolkit ${commit}`);
for (const [arm, info] of Object.entries(manifest)) {
  console.log(`${arm.padEnd(10)} ${String(info.bytes).padStart(6)}B  ${info.sha256.slice(0, 16)}`);
}
