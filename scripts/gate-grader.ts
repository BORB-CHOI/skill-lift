/**
 * 채점기 관문(설계 문서 10절)을 실제 과제 전체에 적용한다.
 *
 * 과제마다 세 제출물을 채점한다.
 * - 기준 해답 + 기준 보고서: 목적 1·2 모두 만점이어야 한다.
 * - 원본 lodash 모듈: 동작 보존은 통과하고 목적 1은 모든 항목에서 실패해야 한다.
 * - compat 일괄 치환: S 항목만 목적 1에서 실패해야 한다.
 * 기준 보고서의 D 반례는 분류 단계(classification.json)의 불일치 입력을 쓴다.
 *
 * 사용: SKILL_EVAL_SEALED=<비공개 폴더> pnpm tsx scripts/gate-grader.ts [입력 수]
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gradeRun, readSealedSeed } from '../src/graders/purpose.js';

interface TaskItem {
  fn: string;
  name: string;
  type: 'S' | 'D' | 'C';
}

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const suiteDir = join(repoRoot, 'suites/es-toolkit/migrate');
const sealedDir = process.env.SKILL_EVAL_SEALED ?? join(repoRoot, 'sealed/es-toolkit/migrate-v3');
const count = Number(process.argv[2] ?? 3000);
const seed = readSealedSeed({ SKILL_EVAL_SEALED: sealedDir });
const examples = new Map(
  (
    JSON.parse(readFileSync(join(suiteDir, 'classification.json'), 'utf8')) as {
      results: { name: string; strictExample: unknown }[];
    }
  ).results.map((r) => [r.name, r.strictExample]),
);

const work = mkdtempSync(join(tmpdir(), 'gate-'));
let failures = 0;
const fail = (msg: string): void => {
  failures++;
  console.log('  실패:', msg);
};
try {
  for (const id of readdirSync(join(suiteDir, 'tasks')).sort()) {
    const taskDir = join(suiteDir, 'tasks', id);
    const items = (
      JSON.parse(readFileSync(join(taskDir, 'task.json'), 'utf8')) as { items: TaskItem[] }
    ).items;
    const original = readFileSync(join(taskDir, 'src/module.ts'), 'utf8');
    const reference = readFileSync(join(sealedDir, 'reference', `${id}.ts`), 'utf8');
    const allCompat = original.replace(
      /import (\w+) from 'lodash\/\w+';/g,
      "import { $1 } from 'es-toolkit/compat';",
    );
    const report = {
      functions: items.map((i) => ({
        lodash: i.fn,
        strictSameAsLodash: i.type === 'S',
        // 분류 단계의 불일치 입력. JavaScript 리터럴 문자열이다.
        counterexample: i.type === 'D' ? examples.get(i.name) : null,
      })),
    };
    const files = {
      reference: join(work, `${id}-reference.ts`),
      original: join(work, `${id}-original.ts`),
      allCompat: join(work, `${id}-compat.ts`),
      report: join(work, `${id}-report.json`),
    };
    writeFileSync(files.reference, reference);
    writeFileSync(files.original, original);
    writeFileSync(files.allCompat, allCompat);
    writeFileSync(files.report, JSON.stringify(report));
    const grade = (submissionFile: string) =>
      gradeRun({ taskDir, submissionFile, reportFile: files.report, seed, count });

    console.log(id, items.map((i) => `${i.type}:${i.fn}`).join(' '));
    const ref = await grade(files.reference);
    if (ref.p1 !== 1)
      fail(`기준 해답 목적 1 = ${ref.p1} ${JSON.stringify(ref.items.map((i) => i.p1))}`);
    if (ref.p2 !== 1)
      fail(`기준 보고서 목적 2 = ${ref.p2} ${JSON.stringify(ref.items.map((i) => i.p2))}`);
    const orig = await grade(files.original);
    if (orig.behaviourOnly !== 1) fail(`원본 제출의 동작 보존 = ${orig.behaviourOnly}`);
    if (orig.p1 !== 0) fail(`원본 제출의 목적 1 = ${orig.p1}`);
    const comp = await grade(files.allCompat);
    for (const item of comp.items) {
      const expected = item.type === 'S' ? 0 : 1;
      if (item.p1.score !== expected) {
        fail(
          `compat 일괄 치환 ${item.type}:${item.fn} 목적 1 = ${item.p1.score} (기대 ${expected}) ${JSON.stringify(item.p1)}`,
        );
      }
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
console.log(failures === 0 ? '채점기 관문 통과' : `실패 ${failures}건`);
process.exitCode = failures === 0 ? 0 : 1;
