/**
 * 프로젝트 단위 채점의 순수 함수: lodash 참조 검사, package.json 검사, 진입점 집계(설계 문서 5.1, 5.3).
 *
 * 파일 읽기와 명령 실행은 project.ts가 맡는다. 여기 함수는 문자열과 객체만 다뤄서 단위 시험으로 고정한다.
 */

/** lodash 계열 모듈 지정자: lodash, lodash/x, lodash-es, lodash-es/x, lodash.x(메서드별 패키지). */
const LODASH_SPEC = String.raw`(?:lodash(?:-es)?(?:/[^'"\x60\s]*)?|lodash\.[\w.-]+)`;

/**
 * lodash를 끌어오는 구문. 따옴표는 같은 종류로 닫혀야 한다.
 * - `from 'x'`: import·export 정적 구문
 * - `import 'x'`: 부수 효과 import
 * - `require('x')`
 * - `import('x')`: 동적 import와 타입 위치의 `import("lodash").LoDashStatic`
 * - `/// <reference types="x" />`
 */
const LODASH_PATTERNS: readonly RegExp[] = [
  new RegExp(String.raw`\bfrom\s*(['"])${LODASH_SPEC}\1`, 'g'),
  new RegExp(String.raw`\bimport\s*(['"])${LODASH_SPEC}\1`, 'g'),
  new RegExp(String.raw`\brequire\s*\(\s*(['"\x60])${LODASH_SPEC}\1\s*\)`, 'g'),
  new RegExp(String.raw`\bimport\s*\(\s*(['"\x60])${LODASH_SPEC}\1`, 'g'),
  new RegExp(String.raw`<reference\s+types\s*=\s*(['"])${LODASH_SPEC}\1`, 'g'),
];

export interface LodashReference {
  /** 프로젝트 루트 기준 상대 경로(슬래시 구분). */
  readonly file: string;
  /** 1부터 센 줄 번호. */
  readonly line: number;
  /** 걸린 구문. */
  readonly text: string;
}

/** 소스 한 파일에서 lodash 참조를 찾는다. */
export function findLodashReferences(file: string, source: string): LodashReference[] {
  const found: { index: number; text: string }[] = [];
  for (const pattern of LODASH_PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      found.push({ index: match.index, text: match[0] });
    }
  }
  // 같은 위치가 두 패턴에 걸리면(예: `import('lodash')`는 패턴 4만, `import 'lodash'`는 2만) 하나로 센다.
  const unique = new Map<number, string>();
  for (const f of found) unique.set(f.index, f.text);
  return [...unique.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, text]) => ({ file, line: lineOf(source, index), text }));
}

function lineOf(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (source.charCodeAt(i) === 10) line++;
  return line;
}

/** lodash 계열 패키지 이름: lodash, lodash-es, lodash.x, @types/lodash, @types/lodash-es, @types/lodash.x. */
const LODASH_PACKAGE = /^(?:@types\/)?lodash(?:-es|\..+)?$/;

const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies'] as const;

export interface LodashDependency {
  readonly field: (typeof DEPENDENCY_FIELDS)[number];
  readonly name: string;
}

/** package.json 하나에서 lodash 계열 의존성을 찾는다. optionalDependencies는 설계 문서 5.1 범위 밖이다. */
export function findLodashDependencies(pkg: unknown): LodashDependency[] {
  const found: LodashDependency[] = [];
  for (const field of DEPENDENCY_FIELDS) {
    for (const name of Object.keys(dependencyMap(pkg, field))) {
      if (LODASH_PACKAGE.test(name)) found.push({ field, name });
    }
  }
  return found;
}

/** es-toolkit이 dependencies에 있는지. devDependencies에만 있으면 배포 코드가 설치 시 받지 못하므로 실패다. */
export function declaresEsToolkit(pkg: unknown): boolean {
  const version = dependencyMap(pkg, 'dependencies')['es-toolkit'];
  return typeof version === 'string' && version.trim() !== '';
}

function dependencyMap(pkg: unknown, field: string): Record<string, unknown> {
  if (typeof pkg !== 'object' || pkg === null) return {};
  const value = (pkg as Record<string, unknown>)[field];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

// ── 진입점 집계(부차 지표) ──

export type EntryKind = 'strict' | 'compat';

/** es-toolkit 지정자를 진입점으로 나눈다. es-toolkit/compat/x도 compat이다. */
export function classifyEsToolkitSpecifier(specifier: string): EntryKind | null {
  if (specifier === 'es-toolkit/compat' || specifier.startsWith('es-toolkit/compat/')) {
    return 'compat';
  }
  if (specifier === 'es-toolkit' || specifier.startsWith('es-toolkit/')) return 'strict';
  return null;
}

const IDENT = String.raw`[A-Za-z_$][\w$]*`;
// import 절은 식별자·*·쉼표·공백과 중괄호 하나로만 이뤄진다. `[^'";]*?`처럼 넓게 잡으면 파일 전체를
// 되짚어 recharts 566파일에 8초가 걸렸다.
const IMPORT_FROM = new RegExp(
  String.raw`\bimport\s+(?:type\s+)?([\w$*\s,]*(?:\{[^{}]*\})?[\w$\s,]*?)\s*\bfrom\s*(['"])([^'"]+)\2`,
  'g',
);
const REQUIRE_ASSIGN = new RegExp(
  String.raw`\b(?:const|let|var)\s+(${IDENT}|\{[^}]*\})\s*=\s*require\s*\(\s*(['"])([^'"]+)\2\s*\)`,
  'g',
);

interface ImportBinding {
  readonly specifier: string;
  /** 이름 있는 import: 원래 이름 → 로컬 이름. */
  readonly named: readonly { imported: string; local: string }[];
  /** 기본 import나 네임스페이스 import의 로컬 이름. */
  readonly namespace: string | null;
  readonly typeOnly: boolean;
}

/** import·require 구문을 지정자와 바인딩으로 푼다. 정규식 기반이라 문자열 안의 구문도 걸릴 수 있다. */
export function parseImports(source: string): ImportBinding[] {
  const out: ImportBinding[] = [];
  for (const m of source.matchAll(IMPORT_FROM)) {
    const typeOnly = /^import\s+type\s/.test(m[0]);
    out.push({ specifier: m[3] ?? '', ...parseClause(m[1] ?? ''), typeOnly });
  }
  for (const m of source.matchAll(REQUIRE_ASSIGN)) {
    out.push({ specifier: m[3] ?? '', ...parseClause(m[1] ?? ''), typeOnly: false });
  }
  return out;
}

function parseClause(clause: string): Pick<ImportBinding, 'named' | 'namespace'> {
  const named: { imported: string; local: string }[] = [];
  let namespace: string | null = null;
  const braces = /\{([^}]*)\}/.exec(clause);
  if (braces !== null) {
    for (const part of (braces[1] ?? '').split(',')) {
      const item = part.trim().replace(/^type\s+/, '');
      if (item === '') continue;
      const [imported, local] = item.split(/\s+as\s+|\s*:\s*/).map((s) => s.trim());
      if (imported !== undefined) named.push({ imported, local: local ?? imported });
    }
  }
  const rest = clause
    .replace(/\{[^}]*\}/, '')
    .replace(/,/g, ' ')
    .trim();
  const ns = /^(?:\*\s*as\s+)?([A-Za-z_$][\w$]*)$/.exec(rest);
  if (ns !== null) namespace = ns[1] ?? null;
  return { named, namespace };
}

/** 파일이 쓰는 lodash 함수 이름. `lodash/x`, `lodash.x` 패키지, 이름 있는 import, `_.x` 멤버 접근을 센다. */
export function collectLodashFunctions(source: string): Set<string> {
  const fns = new Set<string>();
  for (const b of parseImports(source)) {
    if (b.typeOnly) continue;
    const spec = b.specifier;
    const sub = /^lodash(?:-es)?\/([\w$]+)(?:\.js)?$/.exec(spec) ?? /^lodash\.([\w$]+)$/.exec(spec);
    if (sub !== null) {
      fns.add(sub[1] ?? '');
      continue;
    }
    if (spec !== 'lodash' && spec !== 'lodash-es') continue;
    for (const n of b.named) fns.add(n.imported);
    if (b.namespace !== null) {
      for (const name of memberAccesses(source, b.namespace)) fns.add(name);
    }
  }
  fns.delete('');
  return fns;
}

/** 파일이 es-toolkit에서 가져오는 함수 이름 → 진입점. */
export function collectEsToolkitFunctions(source: string): Map<string, Set<EntryKind>> {
  const out = new Map<string, Set<EntryKind>>();
  const add = (name: string, kind: EntryKind): void => {
    const set = out.get(name) ?? new Set<EntryKind>();
    set.add(kind);
    out.set(name, set);
  };
  for (const b of parseImports(source)) {
    if (b.typeOnly) continue;
    const kind = classifyEsToolkitSpecifier(b.specifier);
    if (kind === null) continue;
    // es-toolkit/compat/get처럼 경로에 함수 이름이 있는 지정자.
    const path = /^es-toolkit\/(?:compat\/)?(?:[\w-]+\/)*([\w$]+)$/.exec(b.specifier);
    const fromPath = path !== null && b.specifier !== 'es-toolkit/compat' ? path[1] : undefined;
    if (fromPath !== undefined) {
      add(fromPath, kind);
      continue;
    }
    for (const n of b.named) add(n.imported, kind);
    if (b.namespace !== null) {
      for (const name of memberAccesses(source, b.namespace)) add(name, kind);
    }
  }
  return out;
}

function memberAccesses(source: string, object: string): Set<string> {
  const escaped = object.replace(/\$/g, '\\$');
  const re = new RegExp(String.raw`(?<![\w$.])${escaped}\s*\.\s*([A-Za-z_$][\w$]*)`, 'g');
  return new Set([...source.matchAll(re)].map((m) => m[1] ?? '').filter((s) => s !== ''));
}

export type EntryUsage = 'strict' | 'compat' | 'mixed' | 'none';

/**
 * 원래 lodash 함수마다 전환 뒤 es-toolkit의 어느 진입점에서 같은 이름을 가져오는지 정한다.
 * 같은 이름의 import가 없으면 'none'이다(네이티브 코드나 직접 구현으로 바꿨거나 아직 lodash로 남은 경우).
 * 이름이 바뀐 대체(예: flatten → flattenDeep)는 잡지 못한다.
 */
export function summarizeEntryPoints(
  lodashFunctions: ReadonlySet<string>,
  esToolkit: ReadonlyMap<string, ReadonlySet<EntryKind>>,
): Record<string, EntryUsage> {
  const out: Record<string, EntryUsage> = {};
  for (const fn of [...lodashFunctions].sort()) {
    const kinds = esToolkit.get(fn);
    if (kinds === undefined || kinds.size === 0) out[fn] = 'none';
    else if (kinds.size > 1) out[fn] = 'mixed';
    else out[fn] = kinds.has('compat') ? 'compat' : 'strict';
  }
  return out;
}

/** `git apply --numstat` 출력에서 바뀐 파일 수와 줄 수를 센다. 바이너리 파일은 줄 수 없이 파일만 센다. */
export function parseNumstat(text: string): { files: number; added: number; deleted: number } {
  let files = 0;
  let added = 0;
  let deleted = 0;
  for (const line of text.split(/\r?\n/)) {
    const m = /^(\d+|-)\t(\d+|-)\t/.exec(line);
    if (m === null) continue;
    files++;
    if (m[1] !== '-') added += Number(m[1]);
    if (m[2] !== '-') deleted += Number(m[2]);
  }
  return { files, added, deleted };
}
