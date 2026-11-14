/**
 * export 함수가 어느 진입점의 함수를 쓰는지 판별한다(설계 문서 4.2, 6.1의 3번).
 *
 * TypeScript 컴파일러 API의 TypeChecker로 export 함수 본문의 식별자를 실제 선언에 대응시키고,
 * 그 선언이 import이면 모듈 지정자로 진입점을 정한다. 본문이 모듈 최상위 선언(보조 함수, 변수)을
 * 참조하면 그 선언도 따라가서 본문의 일부로 친다. 타입 위치의 참조는 런타임 동작과 무관하므로 세지 않는다.
 * 매개변수나 지역 변수가 import와 같은 이름을 가려도(shadowing) 그 선언으로 풀리므로 import로 세지 않는다.
 */
import ts from 'typescript';

export type ImportKind = 'strict' | 'compat' | 'lodash';
export type EntryKind = ImportKind | 'none' | 'mixed';
export type ItemType = 'S' | 'D' | 'C';

/**
 * 모듈 지정자를 진입점 종류로 나눈다. 셋 다 아니면 null(판정에서 무시한다).
 * es-toolkit/fp는 strict로 인정하지 않는다.
 */
export function classifySpecifier(specifier: string): ImportKind | null {
  if (specifier === 'es-toolkit/compat' || specifier.startsWith('es-toolkit/compat/')) {
    return 'compat';
  }
  if (specifier.startsWith('es-toolkit/compat') || specifier.startsWith('es-toolkit/fp')) {
    return null;
  }
  if (specifier === 'es-toolkit' || specifier.startsWith('es-toolkit/')) return 'strict';
  if (
    specifier === 'lodash' ||
    specifier.startsWith('lodash/') ||
    specifier === 'lodash-es' ||
    specifier.startsWith('lodash-es/') ||
    // lodash.truncate 같은 메서드별 패키지도 lodash 소스다.
    specifier.startsWith('lodash.')
  ) {
    return 'lodash';
  }
  return null;
}

/** 유형별 인정 진입점(4.2 표). */
export function isEntryOk(type: ItemType, entry: EntryKind): boolean {
  switch (type) {
    case 'S':
      return entry === 'strict';
    case 'D':
      return entry === 'strict' || entry === 'compat';
    case 'C':
      return entry === 'compat';
  }
}

interface ModuleIndex {
  /** import 로컬 이름 → 진입점 종류. 판정 대상이 아닌 지정자는 빠진다. */
  readonly imports: ReadonlyMap<string, ImportKind>;
  /** 최상위 선언 이름 → 선언 노드. */
  readonly locals: ReadonlyMap<string, readonly ts.Node[]>;
  /** export 이름 → 분석할 노드, 또는 다른 모듈에서 그대로 다시 내보낸 경우 그 지정자의 종류. */
  readonly exports: ReadonlyMap<string, { node?: ts.Node; direct?: ImportKind | null }>;
}

function hasExportModifier(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  );
}

function addLocal(locals: Map<string, ts.Node[]>, name: string, node: ts.Node): void {
  const list = locals.get(name) ?? [];
  locals.set(name, [...list, node]);
}

function indexImport(decl: ts.ImportDeclaration, imports: Map<string, ImportKind>): void {
  const clause = decl.importClause;
  if (clause === undefined || clause.phaseModifier === ts.SyntaxKind.TypeKeyword) return;
  if (!ts.isStringLiteral(decl.moduleSpecifier)) return;
  const kind = classifySpecifier(decl.moduleSpecifier.text);
  if (kind === null) return;
  if (clause.name !== undefined) imports.set(clause.name.text, kind);
  const bindings = clause.namedBindings;
  if (bindings === undefined) return;
  if (ts.isNamespaceImport(bindings)) {
    imports.set(bindings.name.text, kind);
    return;
  }
  for (const element of bindings.elements) {
    if (!element.isTypeOnly) imports.set(element.name.text, kind);
  }
}

function indexExportList(
  decl: ts.ExportDeclaration,
  exports: Map<string, { node?: ts.Node; direct?: ImportKind | null }>,
  pendingAliases: [string, string][],
): void {
  if (decl.isTypeOnly || decl.exportClause === undefined) return;
  if (!ts.isNamedExports(decl.exportClause)) return;
  const from =
    decl.moduleSpecifier !== undefined && ts.isStringLiteral(decl.moduleSpecifier)
      ? classifySpecifier(decl.moduleSpecifier.text)
      : undefined;
  for (const element of decl.exportClause.elements) {
    if (element.isTypeOnly) continue;
    const exported = element.name.text;
    const local = (element.propertyName ?? element.name).getText();
    if (from !== undefined) exports.set(exported, { direct: from });
    else pendingAliases.push([exported, local]);
  }
}

function indexModule(source: ts.SourceFile): ModuleIndex {
  const imports = new Map<string, ImportKind>();
  const locals = new Map<string, ts.Node[]>();
  const exports = new Map<string, { node?: ts.Node; direct?: ImportKind | null }>();
  const pendingAliases: [string, string][] = [];

  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement)) {
      indexImport(statement, imports);
    } else if (ts.isExportDeclaration(statement)) {
      indexExportList(statement, exports, pendingAliases);
    } else if (
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
      statement.name !== undefined
    ) {
      addLocal(locals, statement.name.text, statement);
      if (hasExportModifier(statement)) exports.set(statement.name.text, { node: statement });
    } else if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue;
        addLocal(locals, decl.name.text, decl);
        if (hasExportModifier(statement)) exports.set(decl.name.text, { node: decl });
      }
    }
  }
  // `export { local as name }`: 최상위 선언이면 그 노드, import면 그 진입점을 쓴다.
  for (const [exported, local] of pendingAliases) {
    const node = locals.get(local)?.[0];
    if (node !== undefined) exports.set(exported, { node });
    else if (imports.has(local)) exports.set(exported, { direct: imports.get(local) ?? null });
  }
  return { imports, locals, exports };
}

/** import 선언 쪽 노드(ImportClause, ImportSpecifier, NamespaceImport)의 진입점 종류. */
function importKindOf(decl: ts.Declaration): ImportKind | null {
  let clause: ts.ImportClause;
  if (ts.isImportSpecifier(decl)) {
    if (decl.isTypeOnly) return null;
    clause = decl.parent.parent;
  } else if (ts.isNamespaceImport(decl)) {
    clause = decl.parent;
  } else if (ts.isImportClause(decl)) {
    clause = decl;
  } else {
    return null;
  }
  if (clause.phaseModifier === ts.SyntaxKind.TypeKeyword) return null;
  const specifier = clause.parent.moduleSpecifier;
  return ts.isStringLiteral(specifier) ? classifySpecifier(specifier.text) : null;
}

/** 모듈 최상위의 함수·클래스·변수 선언인가. */
function isTopLevelDeclaration(decl: ts.Declaration): boolean {
  if (ts.isFunctionDeclaration(decl) || ts.isClassDeclaration(decl)) {
    return ts.isSourceFile(decl.parent);
  }
  return ts.isVariableDeclaration(decl) && ts.isSourceFile(decl.parent.parent.parent);
}

/** 식별자가 실제로 가리키는 심볼. 단축 속성 `{ x }`는 값 쪽 심볼을 쓴다. */
function symbolOf(checker: ts.TypeChecker, id: ts.Identifier): ts.Symbol | undefined {
  if (ts.isShorthandPropertyAssignment(id.parent) && id.parent.name === id) {
    return checker.getShorthandAssignmentValueSymbol(id.parent);
  }
  return checker.getSymbolAtLocation(id);
}

/** 노드 아래에서 값 위치에 쓰인 식별자가 가리키는 선언을 모은다. */
function collectDeclarations(checker: ts.TypeChecker, root: ts.Node): Set<ts.Declaration> {
  const found = new Set<ts.Declaration>();
  const visit = (node: ts.Node): void => {
    if (ts.isTypeNode(node)) return;
    if (ts.isIdentifier(node)) {
      // 매개변수·지역 변수로 가려진 이름은 그 선언으로 풀리므로 import로 세지 않는다.
      for (const decl of symbolOf(checker, node)?.declarations ?? []) found.add(decl);
      return;
    }
    if (ts.isPropertyAccessExpression(node)) {
      // `a.b`의 b는 속성 이름이다.
      visit(node.expression);
      return;
    }
    if (ts.isPropertyAssignment(node)) {
      if (ts.isComputedPropertyName(node.name)) visit(node.name);
      visit(node.initializer);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}

/** export 하나가 참조하는 진입점 종류의 집합. 최상위 선언은 이어서 따라간다. */
function referencedKinds(checker: ts.TypeChecker, start: ts.Node): Set<ImportKind> {
  const kinds = new Set<ImportKind>();
  const visited = new Set<ts.Node>([start]);
  const queue: ts.Node[] = [start];
  while (queue.length > 0) {
    const node = queue.shift();
    if (node === undefined) break;
    for (const decl of collectDeclarations(checker, node)) {
      const kind = importKindOf(decl);
      if (kind !== null) kinds.add(kind);
      if (isTopLevelDeclaration(decl) && !visited.has(decl)) {
        visited.add(decl);
        queue.push(decl);
      }
    }
  }
  return kinds;
}

/**
 * 제출 파일 하나만으로 Program을 만든다. 심볼 해석만 하면 되므로 lib와 모듈 해석은 끈다.
 * import의 별칭 심볼은 모듈을 풀지 않아도 선언(import 노드)을 갖는다.
 */
function createChecker(sourceText: string): { source: ts.SourceFile; checker: ts.TypeChecker } {
  const fileName = 'submission.ts';
  const source = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.ES2022, true);
  const options: ts.CompilerOptions = { noLib: true, noResolve: true, types: [] };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = (name) => (name === fileName ? source : undefined);
  host.fileExists = (name) => name === fileName;
  host.readFile = (name) => (name === fileName ? sourceText : undefined);
  const program = ts.createProgram({ rootNames: [fileName], options, host });
  return { source, checker: program.getTypeChecker() };
}

function toEntryKind(kinds: ReadonlySet<ImportKind>): EntryKind {
  if (kinds.size === 0) return 'none';
  if (kinds.size > 1) return 'mixed';
  const [only] = [...kinds];
  return only ?? 'none';
}

/**
 * 소스의 export 이름마다 진입점 종류를 판별한다.
 * 요청한 이름이 export에 없으면 'none'으로 둔다.
 */
export function detectEntries(
  sourceText: string,
  exportNames: readonly string[],
): Record<string, EntryKind> {
  const { source, checker } = createChecker(sourceText);
  const index = indexModule(source);
  const result: Record<string, EntryKind> = {};
  for (const name of exportNames) {
    const target = index.exports.get(name);
    if (target === undefined) result[name] = 'none';
    else if (target.node !== undefined)
      result[name] = toEntryKind(referencedKinds(checker, target.node));
    else result[name] = target.direct ?? 'none';
  }
  return result;
}
