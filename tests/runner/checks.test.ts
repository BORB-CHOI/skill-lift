import { describe, expect, it } from 'vitest';
import { manipulationChecks, scanNetworkAttempts } from '../../src/runner/checks.js';
import type { ToolUse } from '../../src/runner/stream.js';

const bash = (command: string): ToolUse => ({ name: 'Bash', input: { command } });
const read = (file_path: string): ToolUse => ({ name: 'Read', input: { file_path } });
const write = (file_path: string, content: string): ToolUse => ({
  name: 'Write',
  input: { file_path, content },
});

describe('scanNetworkAttempts', () => {
  it.each([
    [`node -e "fetch('https://example.com')"`, 'fetch('],
    ['curl -s https://registry.npmjs.org/es-toolkit', 'curl'],
    ['wget example.com', 'wget'],
    ['powershell -c "Invoke-WebRequest example.com"', 'Invoke-WebRequest'],
    ['npm install es-toolkit@latest', 'npm install'],
    ['pnpm add lodash', 'pnpm add'],
    ['yarn add lodash', 'yarn add'],
    ['npx some-tool', 'npx'],
    [`node -e "require('https').get('x')"`, 'node:http'],
  ])('명령 %s 를 %s 로 잡는다', (command, pattern) => {
    const found = scanNetworkAttempts([bash(command)], 1);
    expect(found.map((e) => e.pattern)).toContain(pattern);
    expect(found[0]?.turn).toBe(1);
  });

  it('WebFetch·WebSearch 사용은 이름만으로 잡는다', () => {
    const found = scanNetworkAttempts([{ name: 'WebFetch', input: { url: 'x' } }], 2);
    expect(found).toEqual([{ turn: 2, tool: 'WebFetch', pattern: 'WebFetch', excerpt: 'x' }]);
  });

  it('설치된 실행 파일을 부르는 npx와 평범한 명령은 잡지 않는다', () => {
    const uses = [
      bash('npx tsc --noEmit'),
      bash('npx --no-install esbuild out/module.ts'),
      bash(`node -e "console.log(require('es-toolkit/package.json').version)"`),
      bash('ls node_modules/es-toolkit/dist'),
    ];
    expect(scanNetworkAttempts(uses, 1)).toEqual([]);
  });

  it('파일 내용의 문서 URL은 잡지 않고 네트워크 호출 코드만 잡는다', () => {
    const doc = write('out/module.ts', '// see https://es-toolkit.dev/reference/array/chunk.html');
    expect(scanNetworkAttempts([doc], 1)).toEqual([]);
    const code = write('probe.mjs', "await fetch('https://example.com')");
    expect(scanNetworkAttempts([code], 1).map((e) => e.pattern)).toEqual(['fetch(']);
  });

  it('읽기 도구의 입력은 보지 않는다', () => {
    expect(scanNetworkAttempts([read('https://example.com')], 1)).toEqual([]);
  });
});

describe('manipulationChecks', () => {
  it('아무 행동도 없으면 모두 false다', () => {
    expect(manipulationChecks([bash('ls'), read('src/module.ts')])).toEqual({
      ranAvailabilityCheck: false,
      readEsToolkitSource: false,
      ranLodashComparison: false,
    });
  });

  it('package.json 확인이나 export 목록 뽑기를 확인 명령으로 센다', () => {
    const skillCheck = bash(`node -e "console.log(require.resolve('es-toolkit/package.json'))"`);
    expect(manipulationChecks([skillCheck]).ranAvailabilityCheck).toBe(true);
    const keys = bash(`node -e "console.log(Object.keys(require('es-toolkit/compat')))"`);
    expect(manipulationChecks([keys]).ranAvailabilityCheck).toBe(true);
  });

  it('Windows 경로를 포함해 es-toolkit 소스 읽기를 센다', () => {
    const win = read('C:\\tmp\\ws\\node_modules\\es-toolkit\\dist\\array\\chunk.d.ts');
    expect(manipulationChecks([win]).readEsToolkitSource).toBe(true);
    const grep: ToolUse = {
      name: 'Grep',
      input: { pattern: 'x', path: 'node_modules/es-toolkit' },
    };
    expect(manipulationChecks([grep]).readEsToolkitSource).toBe(true);
  });

  it('두 라이브러리를 함께 불러 실행하면 비교로 센다', () => {
    const inline = bash(
      `node -e "const _ = require('lodash'); const e = require('es-toolkit'); console.log(_.chunk([1],1), e.chunk([1],1))"`,
    );
    expect(manipulationChecks([inline]).ranLodashComparison).toBe(true);
  });

  it('비교 스크립트를 파일로 쓰고 나중에 실행해도 센다', () => {
    const script = write(
      '/ws/cmp.mjs',
      "import _ from 'lodash';\nimport { chunk } from 'es-toolkit';",
    );
    expect(manipulationChecks([script]).ranLodashComparison).toBe(false);
    expect(manipulationChecks([script, bash('node cmp.mjs')]).ranLodashComparison).toBe(true);
  });

  it('전환 결과 module.ts의 타입 검사는 비교로 치지 않는다', () => {
    const out = write(
      '/ws/out/module.ts',
      "import get from 'lodash/get';\nimport { chunk } from 'es-toolkit';",
    );
    expect(manipulationChecks([out, bash('npx tsc --noEmit')]).ranLodashComparison).toBe(false);
  });
});
