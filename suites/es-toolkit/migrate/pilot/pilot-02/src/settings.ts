import merge from 'lodash/merge';
import startCase from 'lodash/startCase';
import truncate from 'lodash/truncate';

export type Config = Record<string, unknown>;

/** 기본 설정에 사용자 설정을 덮어쓴다. base를 변경하고 돌려준다. */
export function applyPatch(base: Config, patch: Config): Config {
  return merge(base, patch);
}

/** 설정 키를 화면에 보이는 제목으로 바꾼다. */
export function toTitle(key: string): string {
  return startCase(key);
}

/** 목록에 보여 줄 미리보기 문구를 만든다. */
export function preview(text: string): string {
  return truncate(text, { length: 24 });
}
