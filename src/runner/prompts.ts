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

/**
 * 사전 등록 이후 탐색 실험에 쓰는 짧은 지시문. 개발자가 흔히 쓰는 한 줄 요청에 가깝게,
 * PROJECT_PROMPT에서 채점 항목을 드러내는 문장(전부 교체, 의존성 제거, 기존 동작 유지)과
 * package.json 선언 지시를 뺐다. 오프라인 실행에 필요한 환경 정보와 비대화 실행 지시만 남겼다.
 */
export const MINIMAL_PROMPT =
  'Migrate this project from lodash to es-toolkit. es-toolkit 1.53.2 is already installed in node_modules. The network is offline, so do not run package installs. Do not ask questions; decide yourself.';

export const PROMPT_VARIANTS = { registered: PROJECT_PROMPT, minimal: MINIMAL_PROMPT } as const;
export type PromptVariant = keyof typeof PROMPT_VARIANTS;

/** 실행 프롬프트. prefix는 baseline이면 '', skill·placebo면 SKILL_PREFIX다. */
export function projectPrompt(prefix: string, body: string = PROJECT_PROMPT): string {
  return prefix + body;
}
