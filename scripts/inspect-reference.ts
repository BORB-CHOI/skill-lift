/**
 * 과제 하나의 기준 해답과 후보별 크기를 출력한다.
 * 사용: pnpm tsx scripts/inspect-reference.ts <과제 폴더> [sealed.json 경로]
 */
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeReference, isSizeSeparated } from '../src/graders/migrate.js';
import { loadTaskWithGeneratedInputs } from '../src/tasks/generated.js';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const taskDir = resolve(process.argv[2] ?? '');
const sealed = resolve(process.argv[3] ?? join(taskDir, 'sealed.json'));
const epsilon = Number(process.argv[4] ?? '0.05');

const { task, source } = await loadTaskWithGeneratedInputs(taskDir, sealed);
const reference = await computeReference(task, source, repoRoot);
const rows = [...reference.candidates]
  .filter((c) => c.correct && c.size !== null)
  .sort((a, b) => (a.size ?? 0) - (b.size ?? 0));

console.log(`과제 ${task.id}: 후보 ${reference.candidates.length}개, 정확한 후보 ${rows.length}개`);
console.log(`기준 ${reference.size}B, 다음 ${reference.nextSize ?? '-'}B, ε=${epsilon}`);
console.log(`크기 분리 조건: ${isSizeSeparated(reference, epsilon) ? '충족' : '미충족'}`);
for (const row of rows.slice(0, 8)) {
  console.log(String(row.size).padStart(7), JSON.stringify(row.choices));
}
