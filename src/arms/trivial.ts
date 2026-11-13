/**
 * LLM 없이 import 줄만 바꾸는 치환 스크립트.
 *
 * 1차 지표가 단순 치환과 구분되는지 확인하는 용도다. 이 스크립트 중 하나라도 과제를 통과하면
 * 그 과제는 판단 없이 풀리는 과제이므로 1차 분석에 쓰지 않는다.
 */

/** `import chunk from 'lodash/chunk';` 형태의 함수별 import. */
const LODASH_IMPORT = /^import\s+(\w+)\s+from\s+['"]lodash\/(\w+)['"];?[ \t]*$/gm;

function replaceImports(source: string, entry: string): string {
  return source.replace(LODASH_IMPORT, (_line, local: string, fn: string) =>
    local === fn
      ? `import { ${fn} } from '${entry}';`
      : `import { ${fn} as ${local} } from '${entry}';`,
  );
}

/** 모든 lodash import를 es-toolkit/compat으로 바꾼다. */
export function trivialCompat(source: string): string {
  return replaceImports(source, 'es-toolkit/compat');
}

/** 모든 lodash import를 es-toolkit으로 바꾼다. */
export function trivialStrict(source: string): string {
  return replaceImports(source, 'es-toolkit');
}

/** 아무것도 바꾸지 않는다. */
export function trivialKeep(source: string): string {
  return source;
}

export const TRIVIAL_ARMS = {
  'trivial-compat': trivialCompat,
  'trivial-strict': trivialStrict,
  'trivial-keep': trivialKeep,
} as const;
