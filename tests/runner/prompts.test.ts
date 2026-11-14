import { describe, expect, it } from 'vitest';
import { PROJECT_PROMPT, SKILL_PREFIX, projectPrompt } from '../../src/runner/prompts.js';

/** 사전 등록한 지시문 원문. 코드의 값이 바뀌면 이 테스트가 깨진다. */
const REGISTERED =
  'Migrate this project from lodash to es-toolkit. Replace every use of lodash in the project and remove lodash from its dependencies. es-toolkit 1.53.2 is already installed in node_modules; add it to package.json yourself. The network is offline, so do not run package installs. Keep the existing behaviour. Do not ask questions; decide yourself.';

describe('지시문', () => {
  it('사전 등록한 원문과 글자 단위로 같다', () => {
    expect(PROJECT_PROMPT).toBe(REGISTERED);
    expect(PROJECT_PROMPT).not.toMatch(/\s$|\n/);
  });

  it('arm별 접두만 앞에 붙인다', () => {
    expect(projectPrompt('')).toBe(PROJECT_PROMPT);
    expect(projectPrompt(SKILL_PREFIX)).toBe(`/es-toolkit:migrate ${PROJECT_PROMPT}`);
  });
});
