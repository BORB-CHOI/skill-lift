/**
 * 사전 등록 파일을 만든다. 본 실행 전에 공개 리포지토리에 올려 "결과를 본 뒤에 기준을 바꾸지
 * 않았다"는 근거로 삼는다.
 *
 * 숨겨야 하는 자료(함수별 후보 코드, 입력 생성 시드, 기준 해답)는 원문을 올리지 않고 파일별
 * SHA-256만 올린다. 비공개 솔트를 붙여 해시한다. 시드처럼 값이 짧은 부분은 솔트가 없으면
 * 해시를 무차별 대입해 복원할 수 있다. 솔트와 원본은 본 실행이 끝난 뒤 함께 공개한다.
 *
 * 사용: pnpm tsx scripts/preregister.ts <모델> <K>
 */
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALLOWED_TOOLS, DISALLOWED_TOOLS, ISOLATION_ARGS } from '../src/runner/claude.js';
import { BUNDLE_OPTIONS } from '../src/graders/size.js';

const [model = 'haiku', kArg = '3'] = process.argv.slice(2);
const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const sealedRoot = join(repoRoot, 'sealed/es-toolkit/migrate');
const publicRoot = join(repoRoot, 'suites/es-toolkit/migrate');

const saltFile = join(sealedRoot, 'salt.txt');
if (!existsSync(saltFile)) writeFileSync(saltFile, randomBytes(32).toString('hex'), 'utf8');
const salt = readFileSync(saltFile, 'utf8').trim();
const salted = (file: string): string =>
  createHash('sha256').update(salt, 'utf8').update(readFileSync(file)).digest('hex');

interface Validation {
  readonly id: string;
  readonly accepted: boolean;
}
const validation = JSON.parse(
  readFileSync(join(sealedRoot, 'validation.json'), 'utf8'),
) as Validation[];
const accepted = validation.filter((v) => v.accepted).map((v) => v.id);
const armManifest: unknown = JSON.parse(
  readFileSync(join(repoRoot, '.arms/manifest.json'), 'utf8'),
);

const sealedHashes: Record<string, string> = {};
for (const file of readdirSync(sealedRoot).sort()) {
  if (file === 'salt.txt') continue;
  sealedHashes[file] = salted(join(sealedRoot, file));
}

const registration = {
  schemaVersion: 1,
  registeredAt: new Date().toISOString(),
  target: {
    skill: 'es-toolkit:migrate',
    source: 'toss/es-toolkit, es-toolkit-plugin/skills/migrate',
    arms: armManifest,
  },
  claim:
    '고정한 과제 집합에서 /es-toolkit:migrate로 Skill을 강제 호출한 에이전트의 결과가 플러그인 없는 에이전트보다 과제의 명시된 요구를 더 잘 충족하는가. 과제 집합, 모델, 버전 밖으로 일반화하지 않는다.',
  environment: {
    model,
    claudeCode: '2.1.316',
    esToolkit: '1.53.2',
    lodash: '4.18.1',
    esbuild: '0.28.2',
    maxTurns: 40,
    timeoutMs: 600_000,
    isolationArgs: ISOLATION_ARGS,
    permissionMode: 'acceptEdits',
    allowedTools: ALLOWED_TOOLS,
    disallowedTools: DISALLOWED_TOOLS,
    bundleOptions: BUNDLE_OPTIONS,
  },
  design: {
    tasks: accepted,
    taskSelection:
      '함수 목록(A 8개, C 4개, B·D 5개)을 순환 조합해 22번째까지 생성하고, 같은 lodash 함수가 겹치는 조합은 건너뛴다. 기준 해답 계산, 크기 분리 조건, 치환 스크립트 3종 불통과를 모두 충족한 과제만 채택한다.',
    repeats: Number(kArg),
    baselineRepeats: 2 * Number(kArg),
    planSeed: 20261113,
    stages: {
      primary: ['baseline', 'skill'],
      controls: ['placebo', 'procedure', 'sabotage'],
    },
    prompt:
      'src/runner/workspace.ts의 buildTaskPrompt. 모든 arm에서 같고, Skill을 로드하는 arm은 앞에 "/es-toolkit:migrate "를 붙인다.',
  },
  grading: {
    primaryMetric:
      '요구 충족 = 동작 보존 ∧ 타입 검사 ∧ 번들 크기 ≤ 기준 × (1 + ε) ∧ 자기 코드 바이트 ≤ 기준 해답의 값 + 허용치',
    keySecondaryMetric: '정확성 = 동작 보존 ∧ 타입 검사',
    epsilon: 0.05,
    ownCodeAllowanceBytes: 200,
    hiddenInputsPerFunction: 3000,
    submissionRule: 'out/ 파일이 있으면 그것, 없고 원본 파일이 바뀌었으면 그것, 아니면 원본 제출',
  },
  analysis: {
    unit: '과제. 과제별 점수는 K회 실행의 통과 비율',
    intentionToTreat:
      '시간·턴 한도에 걸린 실행은 0점. 인프라·하네스 실패는 다시 실행하고 남으면 결측',
    primaryComparison: 'skill 대 baseline(실행 번호 1~K)',
    test: '양측 부호 뒤집기 정확 검정',
    alpha: 0.05,
    primaryHypotheses: 1,
    equivalenceDelta: 0.1,
    equivalence:
      '±δ만큼 옮긴 두 단측 검정이 유의하고, 과제 단위 부트스트랩 구간이 ±δ 안이고, 대조 arm의 평균 통과율이 δ 이상 1−δ 이하이며 0도 1도 아닌 과제가 하한 이상일 때만 동등',
    verdicts: ['improved', 'worsened', 'equivalent', 'inconclusive'],
    exploratory:
      'controls 단계의 arm 비교, 정확성 지표, 과제별·함수별 결과는 탐색용이고 보정하지 않는다',
  },
  disclosures: [
    '이 등록 전에 채택한 과제 16개를 Haiku로 과제당 대조 2회, Skill 1회 실행해 결과를 봤다(실행 이름 probe16). 그 뒤로 과제, 채점 기준, 판정 규칙은 바꾸지 않았다. 바꾼 것은 인프라 실패 재시도의 대기 시간뿐이다.',
    '시험 과제(pilot-01, pilot-02)로 네 차례 시험 실행을 하면서 프롬프트, 입력 범위 정의 방식, 자기 코드 바이트 조건, 대조 arm의 Bash 권한을 고쳤다.',
    '과제 작성자가 SKILL.md를 읽은 뒤에 함수 목록을 만들었다.',
    '1차 가설은 migrate 하나다. recommend와 guide는 이 등록에 들어 있지 않다.',
    '사람 감사, 반분 재표집, 검출력 곡선은 이 등록 시점에 구현돼 있지 않다.',
  ],
  sealed: {
    method: 'SHA-256(솔트 + 파일 바이트). 솔트와 원본은 본 실행 뒤에 공개한다',
    files: sealedHashes,
  },
};

const out = join(publicRoot, 'preregistration.json');
writeFileSync(out, `${JSON.stringify(registration, null, 2)}\n`, 'utf8');
console.log(`사전 등록 파일: ${out}`);
console.log(`과제 ${accepted.length}개, 비공개 파일 ${Object.keys(sealedHashes).length}개의 해시`);
