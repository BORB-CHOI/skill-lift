/**
 * 생성한 과제를 전부 검증한다. 과제마다 기준 해답을 계산하고 채택 조건을 확인한다.
 *
 * 채택 조건:
 * - 동작과 타입이 보존되는 후보가 있다.
 * - 크기 분리 조건을 충족한다.
 * - 치환 스크립트 3종 가운데 통과하는 것이 없다.
 *
 * 사용: pnpm tsx scripts/validate-tasks.ts [ε]
 */
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TRIVIAL_ARMS } from '../src/arms/trivial.js';
import {
  computeReference,
  gradeMigrate,
  isSizeSeparated,
  meetsRequirement,
} from '../src/graders/migrate.js';
import { loadTaskWithGeneratedInputs } from '../src/tasks/generated.js';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const publicRoot = join(repoRoot, 'suites/es-toolkit/migrate/tasks');
const sealedRoot = join(repoRoot, 'sealed/es-toolkit/migrate');
const epsilon = Number(process.argv[2] ?? '0.05');
const OWN_CODE_ALLOWANCE = 200;

const summary: unknown[] = [];
let accepted = 0;
for (const id of readdirSync(publicRoot).sort()) {
  const sealedFile = join(sealedRoot, `${id}.json`);
  if (!existsSync(sealedFile)) continue;
  const { task, source } = await loadTaskWithGeneratedInputs(join(publicRoot, id), sealedFile);
  try {
    const reference = await computeReference(task, source, repoRoot);
    const separated = isSizeSeparated(reference, epsilon);
    const limit = reference.ownBytes + OWN_CODE_ALLOWANCE;
    const trivialPass: string[] = [];
    for (const [name, transform] of Object.entries(TRIVIAL_ARMS)) {
      const grade = await gradeMigrate(task, source, transform(source), repoRoot);
      if (meetsRequirement(grade, reference.size, epsilon, limit)) trivialPass.push(name);
    }
    const ok = separated && trivialPass.length === 0;
    if (ok) accepted++;
    const valid = reference.candidates.filter((c) => c.correct).length;
    console.log(
      `${id} ${ok ? '채택' : '탈락'}  기준 ${reference.size}B 다음 ${reference.nextSize ?? '-'}B  분리 ${separated ? 'O' : 'X'}  ` +
        `정확한 후보 ${valid}/${reference.candidates.length}  통과한 치환 [${trivialPass.join(',')}]  ${JSON.stringify(reference.choices)}`,
    );
    summary.push({
      id,
      accepted: ok,
      reference: reference.choices,
      size: reference.size,
      nextSize: reference.nextSize,
      ownBytes: reference.ownBytes,
      separated,
      trivialPass,
      validCandidates: valid,
      candidates: reference.candidates.length,
    });
  } catch (error) {
    console.log(`${id} 탈락  ${error instanceof Error ? error.message : String(error)}`);
    summary.push({ id, accepted: false, error: String(error) });
  }
}
console.log(`채택 ${accepted}개 / 전체 ${summary.length}개 (ε=${epsilon})`);
writeFileSync(join(sealedRoot, 'validation.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
