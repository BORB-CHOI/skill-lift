import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SKILL_PREFIX, TURN1_TEXT, TURN2_TEXT, turn1Prompt } from '../../src/runner/prompts.js';

/** 설계 5절의 ```text 블록 두 개. 문서와 코드가 어긋나면 이 테스트가 깨진다. */
function designBlocks(): string[] {
  const doc = readFileSync(new URL('../../docs/design.md', import.meta.url), 'utf8').replace(
    /\r\n/g,
    '\n',
  );
  const section = doc.slice(doc.indexOf('## 5. 에이전트 지시문'), doc.indexOf('## 6. 채점'));
  return [...section.matchAll(/```text\n([\s\S]*?)\n```/g)].map((m) => m[1] ?? '');
}

describe('지시문', () => {
  it('두 턴의 문장이 설계 5절과 글자 단위로 같다', () => {
    expect(designBlocks()).toEqual([TURN1_TEXT, TURN2_TEXT]);
  });

  it('첫 턴만 arm별 접두를 붙인다', () => {
    expect(turn1Prompt('')).toBe(TURN1_TEXT);
    expect(turn1Prompt(SKILL_PREFIX)).toBe(`/es-toolkit:migrate ${TURN1_TEXT}`);
  });
});
