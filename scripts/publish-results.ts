/**
 * 실행 결과를 공개용으로 정리한다. 로컬 사용자 이름과 세션 ID를 지운 사본을 만든다.
 *
 * 사용: pnpm eval:publish-results <실행 이름>
 * 출력: runs/es-toolkit-migrate/<실행 이름>/ (실행별 transcript.jsonl, submission.ts, meta.json, grade.json)
 *
 * 지우는 것:
 * - 홈 폴더 경로 속 사용자 이름(os.userInfo().username)
 * - session_id 값
 * 지운 뒤에도 사용자 이름이나 이메일 형식 문자열이 남아 있으면 실패한다.
 */
import {
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { userInfo } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [label = ''] = process.argv.slice(2);
if (label === '') throw new Error('실행 이름을 지정해야 한다');
const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const source = join(repoRoot, 'results/es-toolkit-migrate', label);
const target = join(repoRoot, 'runs/es-toolkit-migrate', label);

const username = userInfo().username;
const usernamePattern = new RegExp(username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
const sessionPattern = /"session_id":"[0-9a-f-]{36}"/g;
const emailPattern = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/** 실행 기록에 정상적으로 나오는 이메일 형식 문자열. 커밋 서명과 패키지 저자 표기다. */
const ALLOWED_EMAILS = new Set([
  'noreply@anthropic.com',
  // lodash 패키지 소스의 저자 표기. 에이전트가 node_modules/lodash를 읽은 실행에 들어 있다.
  'john.david.dalton@gmail.com',
  'mathias@qiwi.be',
]);

function scrub(text: string): string {
  return text.replace(usernamePattern, 'user').replace(sessionPattern, '"session_id":"redacted"');
}

rmSync(target, { recursive: true, force: true });
let files = 0;
const leaks: string[] = [];
for (const runId of readdirSync(source).sort()) {
  const runDir = join(source, runId);
  if (!statSync(runDir).isDirectory()) {
    cpSync(runDir, join(target, runId));
    continue;
  }
  mkdirSync(join(target, runId), { recursive: true });
  for (const file of readdirSync(runDir)) {
    const text = scrub(readFileSync(join(runDir, file), 'utf8'));
    if (usernamePattern.test(text)) leaks.push(`${runId}/${file}: 사용자 이름`);
    usernamePattern.lastIndex = 0;
    for (const email of text.match(emailPattern) ?? []) {
      if (!ALLOWED_EMAILS.has(email.toLowerCase())) leaks.push(`${runId}/${file}: ${email}`);
    }
    writeFileSync(join(target, runId, file), text, 'utf8');
    files++;
  }
}
if (leaks.length > 0) {
  rmSync(target, { recursive: true, force: true });
  throw new Error(
    `지우지 못한 개인 정보가 있어 공개 사본을 지웠다:\n${leaks.slice(0, 20).join('\n')}`,
  );
}
console.log(`공개 사본 ${files}개 파일: ${target}`);
