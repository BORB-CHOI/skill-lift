/**
 * 과제의 생성 입력에서 lodash와 es-toolkit 함수가 갈리는 사례를 찾아 출력한다.
 * 입력 범위를 정할 때 "이 범위에서 strict가 lodash와 같은가"를 확인하는 도구다.
 *
 * 사용: pnpm tsx scripts/find-mismatch.ts <과제 폴더> <내보낸 함수> <lodash 함수> [strict|compat]
 */
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import * as compat from 'es-toolkit/compat';
import * as strict from 'es-toolkit';
import { compareBehaviour, type AnyFunction } from '../src/graders/behaviour.js';
import { loadTaskWithGeneratedInputs } from '../src/tasks/generated.js';
import { gradingInputs } from '../src/tasks/spec.js';

const require = createRequire(import.meta.url);
const lodash = require('lodash') as Record<string, AnyFunction>;
const taskDir = resolve(process.argv[2] ?? '');
const exportName = process.argv[3] ?? '';
const fnName = process.argv[4] ?? '';
const entry = process.argv[5] === 'compat' ? compat : strict;

const { task } = await loadTaskWithGeneratedInputs(taskDir, join(taskDir, 'sealed.json'));
const spec = task.exports.find((e) => e.name === exportName);
const original = lodash[fnName];
const target = (entry as Record<string, unknown>)[fnName];
if (spec === undefined || original === undefined || typeof target !== 'function') {
  throw new Error('과제의 함수 이름이나 라이브러리 함수 이름이 틀렸다');
}

const inputs = gradingInputs(spec);
const result = compareBehaviour(original, target as AnyFunction, inputs);
console.log(`${fnName}: 입력 ${inputs.length}건 중 불일치 ${result.mismatches.length}건`);
for (const mismatch of result.mismatches.slice(0, 4)) {
  const args = inputs[mismatch.index] ?? [];
  const run = (fn: AnyFunction): string => {
    try {
      return JSON.stringify((fn as (...a: unknown[]) => unknown)(...structuredClone(args)));
    } catch (error) {
      return `예외: ${error instanceof Error ? error.message : String(error)}`;
    }
  };
  console.log(`[${mismatch.reason}] 입력 ${JSON.stringify(args)}`);
  console.log(`   lodash     ${run(original)}`);
  console.log(`   es-toolkit ${run(target as AnyFunction)}`);
}
