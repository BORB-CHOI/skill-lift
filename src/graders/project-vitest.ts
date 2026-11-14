/**
 * vitest JSON 보고서를 읽어 기존 테스트 항목과 숨김 검사 항목을 판정한다(설계 문서 5.1, 5.2).
 *
 * 보고서 형식은 vitest의 json 리포터(Jest 호환)다. 파일 하나가 통째로 실패한 경우(문법 오류, import 실패,
 * 훅 오류)는 개별 테스트 결과가 없으므로 따로 "파일 오류"로 센다.
 */

export type TestStatus = 'passed' | 'failed' | 'skipped' | 'pending' | 'todo' | 'disabled';

export interface TestCase {
  /** 프로젝트 루트 기준 상대 경로(슬래시 구분). */
  readonly file: string;
  readonly ancestors: readonly string[];
  readonly title: string;
  readonly fullName: string;
  readonly status: TestStatus;
  readonly failure: string;
}

export interface FileError {
  readonly file: string;
  readonly message: string;
}

export interface ParsedReport {
  readonly tests: readonly TestCase[];
  readonly fileErrors: readonly FileError[];
}

interface RawAssertion {
  ancestorTitles?: unknown;
  title?: unknown;
  fullName?: unknown;
  status?: unknown;
  failureMessages?: unknown;
}
interface RawFile {
  name?: unknown;
  status?: unknown;
  message?: unknown;
  assertionResults?: unknown;
}

/** 경로를 루트 기준 상대 경로로 바꾼다. 드라이브 문자와 구분자 차이는 무시한다. */
export function relativeTo(root: string, file: string): string {
  const norm = (s: string): string => s.replace(/\\/g, '/').replace(/\/+$/, '');
  const r = norm(root);
  const f = norm(file);
  if (f.toLowerCase().startsWith(`${r.toLowerCase()}/`)) return f.slice(r.length + 1);
  return f;
}

/** vitest json 보고서를 읽는다. 형식이 다르면 예외를 던진다. */
export function parseVitestReport(raw: unknown, root: string): ParsedReport {
  if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as RawRoot).testResults)) {
    throw new Error('vitest json 보고서 형식이 아니다(testResults 없음)');
  }
  const tests: TestCase[] = [];
  const fileErrors: FileError[] = [];
  for (const f of (raw as RawRoot).testResults as RawFile[]) {
    const file = relativeTo(root, str(f.name));
    const assertions = Array.isArray(f.assertionResults)
      ? (f.assertionResults as RawAssertion[])
      : [];
    for (const a of assertions) {
      const ancestors = Array.isArray(a.ancestorTitles) ? a.ancestorTitles.map(str) : [];
      const failures = Array.isArray(a.failureMessages) ? a.failureMessages.map(str) : [];
      tests.push({
        file,
        ancestors,
        title: str(a.title),
        fullName: str(a.fullName),
        status: toStatus(a.status),
        failure: failures.join('\n'),
      });
    }
    const message = str(f.message).trim();
    const anyFailed = assertions.some((a) => a.status === 'failed');
    // 테스트 단위 실패 없이 파일이 실패했거나, 파일 단위 메시지가 있으면(훅·수집 오류) 파일 오류다.
    if (f.status === 'failed' && (!anyFailed || message !== '')) {
      fileErrors.push({ file, message: message === '' ? '파일 실패(메시지 없음)' : message });
    }
  }
  return { tests, fileErrors };
}
interface RawRoot {
  testResults?: unknown;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function toStatus(v: unknown): TestStatus {
  switch (v) {
    case 'passed':
    case 'failed':
    case 'skipped':
    case 'pending':
    case 'todo':
    case 'disabled':
      return v;
    default:
      return 'failed';
  }
}

/** 테스트를 가리키는 표준 키: `파일 > describe > ... > it`. */
export function testKey(t: Pick<TestCase, 'file' | 'ancestors' | 'title'>): string {
  return [t.file, ...t.ancestors, t.title].join(' > ');
}

/**
 * fixture 메타의 baselineFailingTests 한 항목. 문자열이면 표준 키, `describe > it` 경로, vitest fullName,
 * 파일 경로(파일 전체 제외) 가운데 하나와 같으면 걸린다. 객체면 file과 이름(name·fullName·title·test)을 함께 본다.
 */
export type BaselineEntry = string | Readonly<Record<string, unknown>>;

export function matchesBaseline(t: TestCase, entry: BaselineEntry): boolean {
  const path = [...t.ancestors, t.title].join(' > ');
  if (typeof entry === 'string') {
    const e = entry.replace(/\\/g, '/').trim();
    return (
      e === testKey(t) ||
      e === `${t.file} > ${t.fullName}` ||
      e === path ||
      e === t.fullName ||
      e === t.file
    );
  }
  const file = typeof entry.file === 'string' ? entry.file.replace(/\\/g, '/') : null;
  if (file !== null && !t.file.endsWith(file) && !file.endsWith(t.file)) return false;
  const names = ['name', 'fullName', 'title', 'test']
    .map((k) => entry[k])
    .filter((v): v is string => typeof v === 'string');
  if (names.length === 0) return file !== null;
  return names.some((n) => n === path || n === t.fullName || n === t.title);
}

function fileMatchesBaseline(file: string, entry: BaselineEntry): boolean {
  if (typeof entry === 'string') return entry.replace(/\\/g, '/').trim() === file;
  const keys = Object.keys(entry);
  return typeof entry.file === 'string' && keys.every((k) => k === 'file' || k === 'reason')
    ? file.endsWith(entry.file.replace(/\\/g, '/'))
    : false;
}

export interface TestCounts {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly fileErrors: number;
}

export function countTests(report: ParsedReport): TestCounts {
  const by = (s: TestStatus[]): number => report.tests.filter((t) => s.includes(t.status)).length;
  return {
    total: report.tests.length,
    passed: by(['passed']),
    failed: by(['failed']),
    skipped: by(['skipped', 'pending', 'todo', 'disabled']),
    fileErrors: report.fileErrors.length,
  };
}

export interface ProjectTestsJudgement {
  readonly pass: boolean;
  /** 원래 커밋에서는 통과하던, 새로 실패한 테스트의 키. */
  readonly unexpectedFailures: readonly string[];
  /** 원래 커밋에서도 실패해 제외한 테스트의 키. */
  readonly excusedFailures: readonly string[];
  readonly fileErrors: readonly FileError[];
  readonly counts: TestCounts;
}

/**
 * CI 모드의 "Obsolete snapshots" 파일 오류가 제외한 테스트 때문에만 생겼는지 본다.
 * 실패한 테스트는 스냅숏 단언까지 가지 못해 그 스냅숏이 쓰이지 않은 것으로 잡힌다. 메시지의
 * `· describe > it N` 줄이 모두 같은 파일의 제외 테스트를 가리키면 baseline 실패의 부산물이다.
 */
export function isObsoleteFromExcused(f: FileError, excused: readonly TestCase[]): boolean {
  if (!f.message.startsWith('Obsolete snapshots')) return false;
  const keys = f.message
    .split(/\r?\n/)
    .filter((l) => l.startsWith('· '))
    .map((l) =>
      l
        .slice(2)
        .replace(/\s+\d+$/, '')
        .trim(),
    );
  if (keys.length === 0) return false;
  const paths = new Set(
    excused.filter((t) => t.file === f.file).map((t) => [...t.ancestors, t.title].join(' > ')),
  );
  return keys.every((k) => paths.has(k));
}

/**
 * 기존 테스트 항목: baseline 실패 목록 밖의 실패와 파일 오류가 하나도 없어야 통과다.
 * 테스트 수가 원래 커밋(minTests)보다 적으면 테스트를 지운 것으로 보고 실패로 한다.
 */
export function judgeProjectTests(
  report: ParsedReport,
  baseline: readonly BaselineEntry[],
  minTests = 1,
): ProjectTestsJudgement {
  const failed = report.tests.filter((t) => t.status === 'failed');
  const excused = failed.filter((t) => baseline.some((e) => matchesBaseline(t, e)));
  const unexpected = failed.filter((t) => !excused.includes(t));
  const fileErrors = report.fileErrors.filter(
    (f) =>
      !baseline.some((e) => fileMatchesBaseline(f.file, e)) && !isObsoleteFromExcused(f, excused),
  );
  return {
    pass:
      unexpected.length === 0 &&
      fileErrors.length === 0 &&
      report.tests.length >= Math.max(1, minTests),
    unexpectedFailures: unexpected.map(testKey),
    excusedFailures: excused.map(testKey),
    fileErrors,
    counts: countTests(report),
  };
}

/** 숨김 검사 manifest.json의 항목. id만 필수다. */
export interface HiddenCheck {
  readonly id: string;
  /** hidden 폴더 기준 spec 파일 이름. */
  readonly file: string;
  /** `it` 제목. 없으면 id를 제목으로 본다. */
  readonly test?: string;
  readonly [extra: string]: unknown;
}

/** manifest.json을 검증한다. */
export function parseManifest(raw: unknown): HiddenCheck[] {
  if (!Array.isArray(raw)) throw new Error('manifest.json은 배열이어야 한다');
  const ids = new Set<string>();
  return raw.map((entry: unknown, i) => {
    if (typeof entry !== 'object' || entry === null)
      throw new Error(`manifest[${i}]가 객체가 아니다`);
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== 'string' || e.id === '') throw new Error(`manifest[${i}].id가 없다`);
    if (typeof e.file !== 'string' || e.file === '') throw new Error(`manifest[${i}].file이 없다`);
    if (ids.has(e.id)) throw new Error(`manifest id 중복: ${e.id}`);
    ids.add(e.id);
    return e as HiddenCheck;
  });
}

export interface HiddenResult {
  readonly id: string;
  readonly pass: boolean;
  readonly detail: string;
}

/** 이름 후보: manifest의 test·name·title, 없으면 id. */
function hiddenNames(check: HiddenCheck): string[] {
  const names = ['test', 'name', 'title', 'it']
    .map((k) => check[k])
    .filter((v): v is string => typeof v === 'string' && v !== '');
  return names.length > 0 ? names : [check.id];
}

/**
 * 숨김 검사 하나의 판정. 해당 파일에서 제목(또는 describe 경로, fullName)이 같은 `it`을 찾고,
 * 찾은 것이 모두 통과해야 통과다. 파일 오류면 실패, 찾지 못해도 실패다.
 */
export function judgeHidden(
  report: ParsedReport,
  checks: readonly HiddenCheck[],
  hiddenDest: string,
): HiddenResult[] {
  const dest = hiddenDest.replace(/\\/g, '/').replace(/\/+$/, '');
  return checks.map((check) => {
    const file = `${dest}/${check.file.replace(/\\/g, '/')}`;
    const fileError = report.fileErrors.find((f) => f.file === file);
    if (fileError !== undefined) {
      return { id: check.id, pass: false, detail: `파일 오류: ${truncate(fileError.message)}` };
    }
    const names = hiddenNames(check);
    const hits = report.tests.filter(
      (t) =>
        t.file === file &&
        names.some(
          (n) => n === t.title || n === t.fullName || n === [...t.ancestors, t.title].join(' > '),
        ),
    );
    if (hits.length === 0) return { id: check.id, pass: false, detail: '보고서에 해당 it 없음' };
    const bad = hits.find((t) => t.status !== 'passed');
    if (bad === undefined) return { id: check.id, pass: true, detail: 'passed' };
    return { id: check.id, pass: false, detail: `${bad.status}: ${truncate(bad.failure)}` };
  });
}

/** 터미널 색 코드. 정규식 리터럴에 제어 문자를 쓰지 않으려고 생성자로 만든다. */
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

export function truncate(s: string, max = 600): string {
  const one = s.replace(ANSI, '');
  return one.length <= max ? one : `${one.slice(0, max)}…`;
}
