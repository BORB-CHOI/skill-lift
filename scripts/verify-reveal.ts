/**
 * 공개한 비공개 자료가 사전 등록의 해시와 같은지 확인한다.
 *
 * 사용: pnpm eval:verify-reveal <사전 등록 파일> <공개 폴더>
 * 예:   pnpm eval:verify-reveal suites/es-toolkit/migrate/preregistration.json revealed/es-toolkit/migrate-v1
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [preregArg = '', revealedArg = ''] = process.argv.slice(2);
if (preregArg === '' || revealedArg === '') {
  throw new Error('사전 등록 파일과 공개 폴더를 지정해야 한다');
}
const registration = JSON.parse(readFileSync(resolve(preregArg), 'utf8')) as {
  sealed: { files: Record<string, string> };
};
const revealed = resolve(revealedArg);
const salt = readFileSync(join(revealed, 'salt.txt'), 'utf8').trim();

let mismatches = 0;
for (const [file, expected] of Object.entries(registration.sealed.files)) {
  const path = join(revealed, file);
  if (!existsSync(path)) {
    console.log(`없음      ${file}`);
    mismatches++;
    continue;
  }
  const actual = createHash('sha256').update(salt, 'utf8').update(readFileSync(path)).digest('hex');
  const ok = actual === expected;
  if (!ok) mismatches++;
  console.log(`${ok ? '일치' : '불일치'}      ${file}`);
}
console.log(
  mismatches === 0
    ? `전부 일치 (${Object.keys(registration.sealed.files).length}개)`
    : `불일치 ${mismatches}개`,
);
process.exitCode = mismatches === 0 ? 0 : 1;
