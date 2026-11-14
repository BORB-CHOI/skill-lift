/**
 * 보고서 반례(JavaScript 배열 리터럴 문자열)를 값으로 바꾼다.
 *
 * JSON은 NaN, -0, undefined, 배열의 빈 칸을 표현하지 못하는데 D 유형의 차이는 대부분 이런 값에서 난다.
 * 에이전트 출력은 신뢰할 수 없어서 eval, new Function, vm을 쓰지 않는다. vm은 다른 realm의 객체를 만들어
 * catalog check()의 `Object.getPrototypeOf(x) === Object.prototype`, `instanceof Date` 검사도 깨뜨린다.
 * 그래서 TypeScript 파서로 구문 트리만 만들고, 허용 목록에 있는 노드만 현재 realm의 값으로 만든다.
 *
 * 허용: 수·문자열·치환 없는 템플릿 리터럴, true/false/null, undefined/NaN/Infinity, 수 앞의 -/+,
 * 배열 리터럴(빈 칸 포함, 전개 금지), 키가 식별자·문자열·수인 객체 리터럴(getter·메서드·전개·계산된 키 금지),
 * `new Set([...])`, `new Map([[k, v], ...])`, `new Date(<수>)`, `Object.create(null)`.
 */
import ts from 'typescript';

export type ParseResult = { ok: true; value: unknown } | { ok: false; reason: string };

export const MAX_LITERAL_LENGTH = 2000;
const MAX_DEPTH = 64;

class LiteralError extends Error {}

function fail(reason: string): never {
  throw new LiteralError(reason);
}

function numberOf(node: ts.Expression, depth: number): number {
  const value = build(node, depth);
  if (typeof value !== 'number') fail('수가 와야 한다');
  return value;
}

function buildArray(node: ts.ArrayLiteralExpression, depth: number): unknown[] {
  // new Array(n)는 빈 칸으로 채워진다. 생략된 원소는 대입하지 않아 빈 칸으로 남긴다.
  const out = new Array<unknown>(node.elements.length);
  node.elements.forEach((element, i) => {
    if (ts.isOmittedExpression(element)) return;
    if (ts.isSpreadElement(element)) fail('배열 전개는 허용하지 않는다');
    out[i] = build(element, depth + 1);
  });
  return out;
}

function propertyKey(name: ts.PropertyName): string {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  if (ts.isNumericLiteral(name)) return String(Number(name.text));
  return fail('객체 키는 식별자, 문자열, 수만 허용한다');
}

function buildObject(node: ts.ObjectLiteralExpression, depth: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) fail('객체에는 `키: 값`만 허용한다');
    // 대입 대신 defineProperty를 써서 `__proto__` 키가 프로토타입을 바꾸지 못하게 한다.
    Object.defineProperty(out, propertyKey(property.name), {
      value: build(property.initializer, depth + 1),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return out;
}

function singleArrayArgument(node: ts.NewExpression, depth: number): unknown[] {
  const args = node.arguments ?? [];
  if (args.length === 0) return [];
  const [first] = args;
  if (args.length !== 1 || first === undefined || !ts.isArrayLiteralExpression(first)) {
    fail('Set과 Map은 배열 리터럴 하나만 받는다');
  }
  return buildArray(first, depth + 1);
}

function buildNew(node: ts.NewExpression, depth: number): unknown {
  if (!ts.isIdentifier(node.expression)) fail('허용하지 않는 생성자');
  switch (node.expression.text) {
    case 'Set':
      return new Set(singleArrayArgument(node, depth));
    case 'Map': {
      const entries = singleArrayArgument(node, depth);
      if (!entries.every((e) => Array.isArray(e) && e.length === 2)) {
        fail('Map 항목은 [키, 값] 쌍이어야 한다');
      }
      return new Map(entries as [unknown, unknown][]);
    }
    case 'Date': {
      const args = node.arguments ?? [];
      const [first] = args;
      if (args.length !== 1 || first === undefined) fail('Date는 수 하나만 받는다');
      return new Date(numberOf(first, depth + 1));
    }
    default:
      return fail(`허용하지 않는 생성자: ${node.expression.text}`);
  }
}

function isObjectCreateNull(node: ts.CallExpression): boolean {
  const callee = node.expression;
  const [arg] = node.arguments;
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === 'Object' &&
    callee.name.text === 'create' &&
    node.arguments.length === 1 &&
    arg?.kind === ts.SyntaxKind.NullKeyword
  );
}

function buildIdentifier(node: ts.Identifier): unknown {
  switch (node.text) {
    case 'undefined':
      return undefined;
    case 'NaN':
      return NaN;
    case 'Infinity':
      return Infinity;
    default:
      return fail(`허용하지 않는 식별자: ${node.text}`);
  }
}

function buildPrefix(node: ts.PrefixUnaryExpression, depth: number): number {
  const value = numberOf(node.operand, depth + 1);
  if (node.operator === ts.SyntaxKind.MinusToken) return -value;
  if (node.operator === ts.SyntaxKind.PlusToken) return value;
  return fail('수 앞에는 -와 +만 허용한다');
}

function build(node: ts.Expression, depth: number): unknown {
  if (depth > MAX_DEPTH) fail('중첩이 너무 깊다');
  if (ts.isParenthesizedExpression(node)) return build(node.expression, depth + 1);
  if (ts.isNumericLiteral(node)) return Number(node.text.replace(/_/g, ''));
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isIdentifier(node)) return buildIdentifier(node);
  if (ts.isPrefixUnaryExpression(node)) return buildPrefix(node, depth);
  if (ts.isArrayLiteralExpression(node)) return buildArray(node, depth);
  if (ts.isObjectLiteralExpression(node)) return buildObject(node, depth);
  if (ts.isNewExpression(node)) return buildNew(node, depth);
  if (ts.isCallExpression(node) && isObjectCreateNull(node)) return Object.create(null) as unknown;
  switch (node.kind) {
    case ts.SyntaxKind.TrueKeyword:
      return true;
    case ts.SyntaxKind.FalseKeyword:
      return false;
    case ts.SyntaxKind.NullKeyword:
      return null;
    default:
      return fail(`허용하지 않는 구문: ${ts.SyntaxKind[node.kind]}`);
  }
}

/** 리터럴 문자열 하나를 값으로 바꾼다. 허용 목록 밖의 구문이 있으면 ok: false. */
export function parseLiteral(source: string): ParseResult {
  if (source.length > MAX_LITERAL_LENGTH) {
    return { ok: false, reason: `길이가 ${MAX_LITERAL_LENGTH}자를 넘는다` };
  }
  const file = ts.createSourceFile(
    'literal.ts',
    `(${source})`,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  );
  const diagnostics = (file as unknown as { parseDiagnostics?: readonly unknown[] })
    .parseDiagnostics;
  if (diagnostics !== undefined && diagnostics.length > 0) {
    return { ok: false, reason: '구문 오류' };
  }
  const [statement] = file.statements;
  if (
    file.statements.length !== 1 ||
    statement === undefined ||
    !ts.isExpressionStatement(statement)
  ) {
    return { ok: false, reason: '식 하나여야 한다' };
  }
  try {
    return { ok: true, value: build(statement.expression, 0) };
  } catch (error) {
    if (error instanceof LiteralError) return { ok: false, reason: error.message };
    throw error;
  }
}
