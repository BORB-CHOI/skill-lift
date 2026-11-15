/**
 * arm별 플러그인 폴더를 만든다. 폴더마다 skills/migrate 하나만 들어 있다(설계 3절).
 *
 * - skill: 공식 SKILL.md(blob 3a83c14)를 서브모듈의 Git 객체에서 바이트 그대로 꺼낸다.
 *   작업 폴더의 파일은 Git 설정에 따라 줄바꿈이 CRLF로 바뀌어 있을 수 있다.
 * - placebo: 공식 frontmatter에서 description과 argument-hint를 일반 문구로 바꾸고(name, allowed-tools는 유지),
 *   본문은 suites/es-toolkit/migrate/arms/placebo.md를 실행할 때 읽어 넣는다.
 * - baseline은 플러그인을 넣지 않으므로 폴더가 없다.
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

const SKILL_PATH = 'es-toolkit-plugin/skills/migrate/SKILL.md';
/** 설계 1절에 고정한 공식 SKILL.md의 blob. */
const SKILL_BLOB_PREFIX = '3a83c14';
const PLACEBO_DESCRIPTION =
  'Guide a careful, reviewable change when a project replaces one dependency with another. Use when the user asks to migrate code from one library to another.';

const PLACEBO_HINT = '<paste code or describe the dependency change>';

function git(...args: string[]): Buffer {
  return execFileSync('git', ['-C', submodule, ...args]);
}

const commit = git('rev-parse', 'HEAD').toString('utf8').trim();
const blob = git('rev-parse', `HEAD:${SKILL_PATH}`).toString('utf8').trim();
if (!blob.startsWith(SKILL_BLOB_PREFIX)) {
  throw new Error(`공식 SKILL.md blob이 ${blob}이다. ${SKILL_BLOB_PREFIX}이어야 한다`);
}
const officialBytes = git('show', `HEAD:${SKILL_PATH}`);
const official = officialBytes.toString('utf8');
const pluginJson = git('show', 'HEAD:es-toolkit-plugin/.claude-plugin/plugin.json');

const match = /^---\n[\s\S]*?\n---\n/.exec(official);
if (match === null) throw new Error('공식 SKILL.md에서 frontmatter를 찾지 못했다');
const descriptionLine = /^description: .*$/m;
if (!descriptionLine.test(match[0])) throw new Error('공식 frontmatter에 description 줄이 없다');
// argument-hint의 공식 문구에는 strict와 compat이 들어 있어 placebo에서는 일반 문구로 바꾼다(설계 3절).
const hintLine = /^argument-hint: .*$/m;
if (!hintLine.test(match[0])) throw new Error('공식 frontmatter에 argument-hint 줄이 없다');
const placeboFrontmatter = match[0]
  .replace(descriptionLine, `description: ${PLACEBO_DESCRIPTION}`)
  .replace(hintLine, `argument-hint: '${PLACEBO_HINT}'`);

const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

rmSync(outRoot, { recursive: true, force: true });
const manifest: Record<string, { sha256: string; bytes: number }> = {};
function emit(arm: string, skill: Buffer): void {
  const dir = join(outRoot, arm);
  mkdirSync(join(dir, '.claude-plugin'), { recursive: true });
  mkdirSync(join(dir, 'skills/migrate'), { recursive: true });
  writeFileSync(join(dir, '.claude-plugin/plugin.json'), pluginJson);
  writeFileSync(join(dir, 'skills/migrate/SKILL.md'), skill);
  manifest[arm] = { sha256: sha256(skill), bytes: skill.byteLength };
}

emit('skill', officialBytes);
const placeboBody = readFileSync(join(variantsDir, 'placebo.md'), 'utf8').replace(/\r\n/g, '\n');
emit('placebo', Buffer.from(`${placeboFrontmatter}\n${placeboBody}`, 'utf8'));

writeFileSync(
  join(outRoot, 'manifest.json'),
  `${JSON.stringify({ source: 'toss/es-toolkit', commit, skillBlob: blob, arms: manifest }, null, 2)}\n`,
  'utf8',
);
console.log(`toss/es-toolkit ${commit}`);
for (const [arm, info] of Object.entries(manifest)) {
  console.log(`${arm.padEnd(10)} ${String(info.bytes).padStart(6)}B  ${info.sha256.slice(0, 16)}`);
}
