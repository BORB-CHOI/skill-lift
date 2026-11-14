/**
 * 두 턴의 지시문. 설계 5절의 원문과 글자 단위로 같다. 사전 등록에 이 값을 그대로 넣는다.
 *
 * 모든 arm이 같은 문장을 받는다. skill·placebo arm은 첫 턴 앞에 슬래시 명령만 붙인다.
 */

/** skill·placebo arm이 첫 턴 앞에 붙이는 슬래시 명령. */
export const SKILL_PREFIX = '/es-toolkit:migrate ';

export const TURN1_TEXT =
  'Convert the lodash imports in src/module.ts to es-toolkit and write the result to out/module.ts. We are moving to es-toolkit to reduce bundle size. For each lodash function: use the main es-toolkit entry if it keeps the existing behaviour for the inputs described in the JSDoc; otherwise use es-toolkit/compat if that keeps the behaviour; if neither keeps it, keep the lodash import. Keep the exported signatures. Do not ask questions; decide yourself.';

export const TURN2_TEXT =
  'Write out/migration-report.json in this shape:\n{ "functions": [ { "lodash": "<lodash function name>", "strictSameAsLodash": <true|false>, "counterexample": <string or null> } ] }\n"counterexample" is a string holding a JavaScript array literal: the argument list for the exported function, e.g. "[[1, NaN, -0], undefined]". Allowed syntax: number, string, boolean, null, undefined, NaN, Infinity, unary minus, array literals (holes allowed), plain object literals, new Set([...]), new Map([...]), new Date(<number>), Object.create(null).\n"strictSameAsLodash" is true if the function of the same name from the main "es-toolkit" entry, called with the same arguments as the original lodash call, returns the same result as lodash for every input in the JSDoc range of the exported function that uses it. If it is false and that function exists in the main entry, give one argument list, within the JSDoc range, for which the results differ.';

/** 첫 턴 프롬프트. prefix는 baseline이면 '', skill·placebo면 SKILL_PREFIX다. */
export function turn1Prompt(prefix: string): string {
  return prefix + TURN1_TEXT;
}

/** 첫 턴 산출물과 두 번째 턴 산출물의 작업 폴더 기준 경로. */
export const SUBMISSION_PATH = 'out/module.ts';
export const REPORT_PATH = 'out/migration-report.json';
