/**
 * 프로젝트 전환 과제의 지시문. 사전 등록에 이 값을 그대로 넣는다.
 *
 * 모든 arm이 같은 문장을 받는다. skill·placebo arm은 앞에 슬래시 명령만 붙인다.
 * 실행은 한 턴이다. 산출물은 작업 폴더의 변경(patch)이고 따로 보고서를 받지 않는다.
 */

/** skill·placebo arm이 지시문 앞에 붙이는 슬래시 명령. */
export const SKILL_PREFIX = '/es-toolkit:migrate ';

export const PROJECT_PROMPT =
  'Migrate this project from lodash to es-toolkit. Replace every use of lodash in the project and remove lodash from its dependencies. es-toolkit 1.53.2 is already installed in node_modules; add it to package.json yourself. The network is offline, so do not run package installs. Keep the existing behaviour. Do not ask questions; decide yourself.';

/** 실행 프롬프트. prefix는 baseline이면 '', skill·placebo면 SKILL_PREFIX다. */
export function projectPrompt(prefix: string): string {
  return prefix + PROJECT_PROMPT;
}
