/**
 * 채점기 관문(설계 문서 9절). AI를 돌리지 않고 프로젝트마다 합성 제출 세 개를 채점한다.
 * 1. empty: 빈 패치(원래 lodash 프로젝트). lodash 제거·의존성·es-toolkit 선언은 실패, 테스트·숨김 검사는 통과해야 한다.
 * 2. human: 사람이 머지한 전환 PR의 소스 변경. 숨김 검사 결과를 manifest의 failsOnHumanPR과 대조한다.
 * 3. naive-compat: lodash import를 모두 es-toolkit/compat으로 기계적으로 바꾼 제출.
 *
 * 결과: results/gate-project/<project>/<case>/{changes.patch, grade.json}
 * 사용: pnpm tsx scripts/gate-project.ts [project ...]
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  defaultRoots,
  gradeProject,
  loadProjectSetup,
  type ProjectGrade,
  type ProjectSetup,
} from '../src/graders/project.js';
import { prepareWorkspace, removeWorkspace } from '../src/graders/project-workspace.js';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const evalProjects = resolve(repoRoot, '../../eval-projects');
const roots = defaultRoots(repoRoot);
const outRoot = join(repoRoot, 'results/gate-project');

function sh(cmd: string, args: string[], cwd: string): string {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} 실패: ${r.stderr}`);
  return r.stdout;
}

/** 사람 PR의 소스 변경을 패치로 만든다. 원본 체크아웃에서는 읽기만 한다. */
function humanPatch(project: string): string {
  if (project === 'recharts') {
    const repo = join(evalProjects, 'recharts');
    return sh(
      'git',
      ['diff', '--binary', 'a28c686', 'bb95d1a', '--', 'src', 'test', 'package.json', '.eslintrc'],
      repo,
    );
  }
  if (project === 'swagger-typescript-api') {
    const dir = join(evalProjects, 'swagger-typescript-api/.yarn');
    const src = readFileSync(join(dir, 'pr_src.diff'), 'utf8');
    // pr1562.diff에서 package.json 부분만 떼어 붙인다.
    const full = readFileSync(join(dir, 'pr1562.diff'), 'utf8');
    const m = /^diff --git a\/package\.json b\/package\.json\n[\s\S]*?(?=^diff --git )/m.exec(full);
    if (m === null) throw new Error('pr1562.diff에 package.json 변경이 없다');
    return `${src.endsWith('\n') ? src : `${src}\n`}${m[0]}`;
  }
  throw new Error(`사람 PR 패치를 모르는 프로젝트: ${project}`);
}

const LODASH_FAMILY = /^(?:@types\/)?lodash(?:-es|\..+)?$/;

/** lodash import를 모두 es-toolkit/compat으로 바꾸고 package.json을 고친 패치를 만든다. */
function naiveCompatPatch(setup: ProjectSetup): string {
  const work = join(tmpdir(), 'skill-eval-gate', `${setup.project}-${Date.now()}`);
  try {
    prepareWorkspace(setup.fixtureDir, work, []);
    const files = new Set<string>();
    for (const g of setup.config.lodashScanGlobs) {
      for (const f of globSync(g, { cwd: work })) files.add(f);
    }
    for (const f of files) {
      const path = join(work, f);
      const before = readFileSync(path, 'utf8');
      const after = before
        .replace(
          /import\s+(\w+)\s+from\s+(['"])lodash\/(\w+)\2/g,
          (_m, local: string, q: string, fn: string) =>
            local === fn
              ? `import { ${fn} } from ${q}es-toolkit/compat${q}`
              : `import { ${fn} as ${local} } from ${q}es-toolkit/compat${q}`,
        )
        .replace(
          /import\s+(\w+)\s+from\s+(['"])lodash\2/g,
          'import * as $1 from $2es-toolkit/compat$2',
        )
        .replace(/from\s+(['"])lodash\1/g, 'from $1es-toolkit/compat$1')
        .replace(/import\((['"])lodash\1\)\.LoDashStatic/g, 'typeof import($1es-toolkit/compat$1)');
      if (after !== before) writeFileSync(path, after, 'utf8');
    }
    for (const rel of setup.config.packageJsonPaths) {
      const path = join(work, rel);
      const text = readFileSync(path, 'utf8');
      const pkg = JSON.parse(text) as Record<string, Record<string, string> | undefined>;
      for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
        const deps = pkg[field];
        if (deps === undefined) continue;
        pkg[field] = Object.fromEntries(
          Object.entries(deps).filter(([n]) => !LODASH_FAMILY.test(n)),
        );
      }
      if (rel === setup.config.packageJsonPaths[0]) {
        const deps = { ...(pkg.dependencies ?? {}), 'es-toolkit': '^1.53.2' };
        pkg.dependencies = Object.fromEntries(
          Object.entries(deps).sort(([a], [b]) => a.localeCompare(b)),
        );
      }
      const eol = text.includes('\r\n') ? '\r\n' : '\n';
      writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`.replace(/\n/g, eol), 'utf8');
    }
    return sh('git', ['diff', '--binary'], work);
  } finally {
    removeWorkspace(work, []);
  }
}

interface Expect {
  readonly [id: string]: boolean;
}

/** 빈 패치에서 기대하는 항목 결과. 숨김 검사는 모두 통과다. */
function emptyExpect(setup: ProjectSetup): Expect {
  return {
    lodashRemoved: false,
    lodashDependencyRemoved: false,
    esToolkitDeclared: false,
    typecheck: true,
    projectTests: true,
    ...Object.fromEntries(setup.hiddenChecks.map((h) => [h.id, true])),
  };
}

/** 사람 PR에서 기대하는 숨김 검사 결과(manifest의 failsOnHumanPR). */
function humanExpect(setup: ProjectSetup): Expect {
  return Object.fromEntries(
    setup.hiddenChecks
      .filter((h) => typeof h.failsOnHumanPR === 'boolean')
      .map((h) => [h.id, h.failsOnHumanPR !== true]),
  );
}

function summarize(name: string, grade: ProjectGrade, expect: Expect): string[] {
  const lines = [
    `  [${name}] 점수 ${grade.score.toFixed(3)} (${grade.counts.passed}/${grade.counts.items}), 숨김 ${grade.counts.hidden.passed}/${grade.counts.hidden.total}, ` +
      `테스트 ${JSON.stringify(grade.counts.tests)}, 바뀐 파일 ${grade.secondary.changedFiles}, ${((grade.durations.total ?? 0) / 1000).toFixed(0)}초`,
  ];
  if (grade.applyError !== null) lines.push(`    적용 실패: ${grade.applyError}`);
  for (const item of grade.items) {
    if (item.kind === 'hidden') continue;
    lines.push(`    ${item.pass ? 'PASS' : 'FAIL'} ${item.id}`);
  }
  const failedHidden = grade.items.filter((i) => i.kind === 'hidden' && !i.pass).map((i) => i.id);
  lines.push(`    숨김 실패: ${failedHidden.length === 0 ? '없음' : failedHidden.join(', ')}`);
  const mismatches = Object.entries(expect)
    .filter(([id, want]) => grade.items.find((i) => i.id === id)?.pass !== want)
    .map(([id, want]) => `${id}(기대 ${want ? '통과' : '실패'})`);
  lines.push(`    기대와 다름: ${mismatches.length === 0 ? '없음' : mismatches.join(', ')}`);
  return lines;
}

const wanted = process.argv.slice(2);
const projects = (wanted.length > 0 ? wanted : readdirSync(roots.suiteRoot)).filter((p) =>
  existsSync(join(roots.suiteRoot, p, 'grading.json')),
);
const report: string[] = [];
for (const project of projects) {
  const setup = loadProjectSetup(project, roots);
  report.push(`${project}: 숨김 검사 ${setup.hiddenChecks.length}개`);
  const cases: { name: string; patch: () => string; expect: Expect }[] = [
    { name: 'empty', patch: () => '', expect: emptyExpect(setup) },
    { name: 'human', patch: () => humanPatch(project), expect: humanExpect(setup) },
    { name: 'naive-compat', patch: () => naiveCompatPatch(setup), expect: {} },
  ];
  for (const c of cases) {
    const dir = join(outRoot, project, c.name);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const patchFile = join(dir, 'changes.patch');
    try {
      writeFileSync(patchFile, c.patch(), 'utf8');
    } catch (e) {
      report.push(`  [${c.name}] 패치 생성 실패: ${(e as Error).message}`);
      continue;
    }
    console.log(`${project} ${c.name} 채점 시작`);
    const grade = await gradeProject({
      setup,
      patchFile,
      log: (m) => {
        console.log(`  ${m}`);
      },
    });
    writeFileSync(join(dir, 'grade.json'), `${JSON.stringify(grade, null, 2)}\n`, 'utf8');
    const lines = summarize(c.name, grade, c.expect);
    console.log(lines.join('\n'));
    report.push(...lines);
  }
}
writeFileSync(join(outRoot, 'summary.txt'), `${report.join('\n')}\n`, 'utf8');
console.log(`\n${report.join('\n')}`);
