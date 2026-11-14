/**
 * 파일럿 실행. 본 과제가 아닌 과제로 실행기와 채점기를 끝까지 연결해 보고,
 * 1회 실행의 토큰·턴 수·시간을 측정한다.
 *
 * 사용: pnpm tsx scripts/pilot.ts <모델> <반복 횟수> <과제 ID>
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeReference, gradeMigrate, meetsRequirement } from '../src/graders/migrate.js';
import { buildArgs, runProcess } from '../src/runner/claude.js';
import { parseTranscript } from '../src/runner/stream.js';
import { loadTaskWithGeneratedInputs } from '../src/tasks/generated.js';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const pilotDir = join(repoRoot, '.pilot');
const taskDir = join(repoRoot, 'suites/es-toolkit/migrate/pilot', process.argv[4] ?? 'pilot-01');
const model = process.argv[2] ?? 'haiku';
const repeats = Number(process.argv[3] ?? '2');
const EPSILON = 0.05;
/** 어댑터용으로 허용하는 자기 코드의 추가 바이트. 사전 등록 전에 오너가 확정할 값이다. */
const OWN_CODE_ALLOWANCE = 200;
const MAX_TURNS = 40;
const TIMEOUT_MS = 10 * 60 * 1000;

const SIZE_SCRIPT = `import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
const file = process.argv[2] ?? 'src/report.ts';
const r = await build({ entryPoints: [file], bundle: true, minify: true, treeShaking: true,
  format: 'esm', platform: 'browser', target: 'es2022', write: false, metafile: true, logLevel: 'silent' });
const own = Object.entries(Object.values(r.metafile.outputs)[0].inputs).filter(([p]) => !p.includes('node_modules/')).reduce((s, [, i]) => s + i.bytesInOutput, 0);
console.log(file, gzipSync(r.outputFiles[0].contents, { level: 9 }).byteLength, 'bytes (min+gzip),', own, 'bytes of own code');
`;

const { task, source } = await loadTaskWithGeneratedInputs(taskDir, join(taskDir, 'sealed.json'));
const targetName = task.file.split('/').pop() ?? task.file;

const examples = task.exports
  .map((e) => `${e.name}: ${e.examples.map((args) => JSON.stringify(args)).join(' ; ')}`)
  .join('\n');
const taskSentence = `Migrate the lodash usage in ${task.file} to es-toolkit. Keep the exported function signatures and the existing behaviour. Put the result in a single file and do not create other source files. The goal is to reduce bundle size while relying on a maintained library. Use es-toolkit functions and do not hand-write replacements for the utilities; keep a lodash import only when no es-toolkit function preserves the behaviour, and add at most a small adapter around a library call when the call shape differs. Grading checks (1) that results equal the original for inputs within the input range below, (2) that type checking passes, (3) that the bundle size printed by \`npm run size -- <file>\` is close to the smallest size reachable with library functions, and (4) that the bytes of your own code in the bundle, also printed by that command, stay within a small allowance over the original. Do not install anything. Write the whole migrated file to out/${targetName}.

Input range: ${task.inputRange}

Example inputs (argument lists):
${examples}`;

function makeWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'skill-eval-'));
  cpSync(join(taskDir, 'src'), join(dir, 'src'), { recursive: true });
  mkdirSync(join(dir, 'tools'));
  writeFileSync(join(dir, 'tools/size.mjs'), SIZE_SCRIPT, 'utf8');
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify(
      { name: 'fixture', private: true, type: 'module', scripts: { size: 'node tools/size.mjs' } },
      null,
      2,
    ),
    'utf8',
  );
  writeFileSync(
    join(dir, 'tsconfig.json'),
    JSON.stringify(
      {
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
      },
      null,
      2,
    ),
    'utf8',
  );
  // 의존성은 미리 설치한 폴더를 실행마다 복사한다. 폴더를 연결(junction)해 공유하면 에이전트가
  // node_modules 안에 만든 임시 파일이 다음 실행에 남는다(파일럿에서 실제로 관측).
  cpSync(join(pilotDir, 'deps/node_modules'), join(dir, 'node_modules'), { recursive: true });
  return dir;
}

/** 산출물 규칙: out/ 파일이 있으면 그것, 없고 src/ 파일이 바뀌었으면 그것, 아니면 원본 제출. */
function collectSubmission(workspace: string): { kind: 'out' | 'src' | 'original'; code: string } {
  const read = (path: string): string => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  const out = join(workspace, 'out', targetName);
  if (existsSync(out)) return { kind: 'out', code: read(out) };
  const inPlace = read(join(workspace, task.file));
  return inPlace === source ? { kind: 'original', code: source } : { kind: 'src', code: inPlace };
}

const reference = await computeReference(task, source, repoRoot);
console.log(
  `기준 해답 ${reference.size}B ${JSON.stringify(reference.choices)}, 모델 ${model}, K=${repeats}`,
);

const ownCodeLimit = reference.ownBytes + OWN_CODE_ALLOWANCE;
console.log(
  `자기 코드 한도 ${ownCodeLimit}B (기준 해답 ${reference.ownBytes}B + ${OWN_CODE_ALLOWANCE}B)`,
);

const arms = [
  { name: 'baseline', pluginDir: null, prefix: '' },
  { name: 'skill', pluginDir: join(pilotDir, 'plugin-migrate'), prefix: '/es-toolkit:migrate ' },
] as const;

for (let k = 1; k <= repeats; k++) {
  for (const arm of arms) {
    const workspace = makeWorkspace();
    try {
      const run = await runProcess({
        command: 'claude',
        args: buildArgs({
          model,
          maxTurns: MAX_TURNS,
          emptyMcpConfig: join(pilotDir, 'empty-mcp.json'),
          pluginDir: arm.pluginDir,
        }),
        cwd: workspace,
        prompt: arm.prefix + taskSentence,
        timeoutMs: TIMEOUT_MS,
      });
      writeFileSync(
        join(pilotDir, 'runs', `${task.id}-${arm.name}-${k}.jsonl`),
        run.stdout,
        'utf8',
      );
      const transcript = parseTranscript(run.stdout);
      const submission = collectSubmission(workspace);
      const grade = await gradeMigrate(task, source, submission.code, repoRoot);
      const usage = transcript.result?.usage;
      console.log(
        [
          `${arm.name}#${k}`,
          `제출=${submission.kind}`,
          `동작=${grade.behaviour.passed ? 'O' : 'X'}`,
          `타입=${grade.types.passed ? 'O' : 'X'}`,
          `크기=${grade.size ?? '-'}B`,
          `자기코드=${grade.ownBytes ?? '-'}B`,
          `요구충족=${meetsRequirement(grade, reference.size, EPSILON, ownCodeLimit) ? 'O' : 'X'}`,
          `종료=${run.timedOut ? 'timeout' : (transcript.result?.subtype ?? `exit ${run.exitCode}`)}`,
          `턴=${transcript.result?.numTurns ?? '-'}`,
          `시간=${Math.round(run.durationMs / 1000)}s`,
          `입력=${usage ? usage.input + usage.cacheRead + usage.cacheCreation : '-'}`,
          `출력=${usage?.output ?? '-'}`,
          `거부=[${transcript.result?.deniedTools.map((t) => t.name).join(',') ?? ''}]`,
          `skills=${transcript.init?.skills.length ?? '-'}`,
          `도구=[${[...new Set(transcript.toolUses.map((t) => t.name))].join(',')}]`,
        ].join('  '),
      );
      if (!grade.behaviour.passed) {
        console.log(
          `   동작 불일치: ${grade.behaviour.loadError ?? JSON.stringify(grade.behaviour.mismatches)}`,
        );
      }
      if (!grade.types.passed) {
        console.log(
          `   타입: ${[...grade.types.diagnostics, ...grade.types.bypasses].slice(0, 3).join(' | ')}`,
        );
      }
    } finally {
      rmSync(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    }
  }
}
