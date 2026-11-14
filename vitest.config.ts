import { defineConfig } from 'vitest/config';

// 이 저장소의 테스트는 tests/ 아래에만 있다.
// suites/es-toolkit/projects/*/hidden의 숨김 검사는 대상 프로젝트에 복사해 그 프로젝트의 설정으로 실행한다.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
