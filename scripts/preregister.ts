/**
 * 사전 등록 파일을 만든다(설계 문서 8절, 프로젝트 단위).
 *
 * 담는 것
 * - 등록 시점의 커밋과 설계 문서 해시. 채점기, 실행기, 통계 코드는 이 커밋에 고정된다.
 * - 프로젝트별 fixture 메타데이터(직전 커밋, fixture base 커밋, 명령, 원래 실패하는 테스트)
 * - 숨김 검사 파일의 SHA-256과 manifest(사람 PR에서의 결과 포함), 채점 설정(grading.json)
 * - 지시문 원문, 조건별 SKILL.md 해시(.arms/manifest.json), placebo 원문
 * - 프로젝트·모델 목록, Δ, α, K, 시간·턴 한도, Claude Code 버전, 모델별 단가
 * - 스모크 실행 이름과 검출력 계산 출력
 *
 * 사용:
 *   pnpm tsx scripts/preregister.ts --k <K> --max-turns <N> --timeout-min <분> \
 *     --smoke <스모크 실행 이름> --power <power 출력 파일> [--out <파일>]
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { PROJECT_PROMPT, SKILL_PREFIX } from '../src/runner/prompts.js';

const { values } = parseArgs({
  options: {
    k: { type: 'string' },
    'max-turns': { type: 'string' },
    'timeout-min': { type: 'string' },
    smoke: { type: 'string' },
    power: { type: 'string' },
    fixtures: { type: 'string', default: 'D:\\Develop\\eval-projects\\fixtures-meta' },
    out: { type: 'string', default: 'suites/es-toolkit/projects/preregistration.json' },
  },
});
const need = (name: string, v: string | undefined): string => {
  if (v === undefined) throw new Error(`--${name}가 필요하다`);
  return v;
};
const K = Number(need('k', values.k));
const maxTurns = Number(need('max-turns', values['max-turns']));
const timeoutMin = Number(need('timeout-min', values['timeout-min']));
const smoke = need('smoke', values.smoke);
const powerFile = need('power', values.power);

const PROJECTS = ['recharts', 'swagger-typescript-api'] as const;
const MODELS = ['claude-sonnet-5-5', 'claude-haiku-5-5'] as const;
/** 모델별 공식 단가(USD, 1M 토큰당). 캐시 쓰기는 입력의 1.25배. Haiku 5.5 캐시 읽기는 입력의 0.1배로 둔다. */
const PRICING = {
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const projectsDir = join(repoRoot, 'suites/es-toolkit/projects');
const sha256 = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

const status = execFileSync('git', ['status', '--porcelain'], { cwd: repoRoot })
  .toString('utf8')
  .trim();
if (status !== '') {
  throw new Error('커밋하지 않은 변경이 있다. 등록 시점의 코드를 고정하려면 먼저 커밋해야 한다');
}
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot })
  .toString('utf8')
  .trim();
const claudeVersion = execFileSync('claude', ['--version'], { shell: true })
  .toString('utf8')
  .trim();

/** 폴더 아래 파일마다 SHA-256. */
function hashTree(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string): void => {
    for (const name of readdirSync(d).sort()) {
      const path = join(d, name);
      if (statSync(path).isDirectory()) walk(path);
      else out[relative(dir, path).replace(/\\/g, '/')] = sha256(readFileSync(path));
    }
  };
  walk(dir);
  return out;
}

const projects = Object.fromEntries(
  PROJECTS.map((name) => {
    const dir = join(projectsDir, name);
    return [
      name,
      {
        fixture: readJson(join(values.fixtures, `${name}.json`)),
        grading: readJson(join(dir, 'grading.json')),
        hiddenManifest: readJson(join(dir, 'hidden/manifest.json')),
        hiddenHashes: hashTree(join(dir, 'hidden')),
      },
    ];
  }),
);

const prereg = {
  version: 'project-v1',
  createdAt: new Date().toISOString(),
  commit,
  design: {
    file: 'docs/design.md',
    sha256: sha256(readFileSync(join(repoRoot, 'docs/design.md'))),
  },
  target: readJson(join(repoRoot, '.arms/manifest.json')),
  environment: { claudeVersion, esToolkit: '1.53.2' },
  projects: [...PROJECTS],
  models: [...MODELS],
  arms: ['baseline', 'skill', 'placebo'],
  prompts: { armPrefix: SKILL_PREFIX, project: PROJECT_PROMPT },
  placebo: readFileSync(join(repoRoot, 'suites/es-toolkit/migrate/arms/placebo.md'), 'utf8'),
  projectSetup: projects,
  scoring: '실행 점수 = 통과한 채점 항목의 비율(설계 5절). 시간·턴 한도는 0점, 오염은 제외.',
  delta: 0.15,
  alpha: 0.05,
  K,
  limits: { maxTurns, timeoutMin },
  pricing: PRICING,
  smoke: { label: smoke, note: '스모크 실행은 본 실험 분석에 쓰지 않는다.' },
  power: readFileSync(powerFile, 'utf8'),
};

const out = join(repoRoot, values.out);
writeFileSync(out, `${JSON.stringify(prereg, null, 2)}\n`, 'utf8');
console.log(`사전 등록 파일: ${out}`);
console.log(`커밋 ${commit.slice(0, 7)}, K=${K}, 한도 ${maxTurns}턴/${timeoutMin}분`);
