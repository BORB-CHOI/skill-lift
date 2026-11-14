/**
 * 동작 보존 검사.
 *
 * 원본 함수와 이전된 함수를 같은 입력 목록으로 실행해 결과를 비교한다. 정답을 사람이 적지 않고
 * 원본(lodash) 구현을 기준으로 쓴다. 비교 대상은 세 가지다: 예외 발생 여부, 반환값,
 * 호출 뒤의 인자(인자를 변경하는 함수의 차이를 잡으려고).
 */
import { structuralEqual } from './equal.js';

export type AnyFunction = (...args: never[]) => unknown;

export interface Outcome {
  readonly threw: boolean;
  readonly value: unknown;
  /** 호출 뒤의 인자 상태. */
  readonly args: readonly unknown[];
}

export interface Mismatch {
  /** 입력 목록에서의 위치. */
  readonly index: number;
  readonly reason: 'threw' | 'value' | 'args';
}

export interface BehaviourResult {
  readonly passed: boolean;
  readonly checked: number;
  readonly mismatches: readonly Mismatch[];
}

/**
 * 인자를 깊이 복제한다. 함수는 복제할 수 없으므로 참조를 그대로 둔다.
 * structuredClone은 함수를 만나면 예외를 내서 콜백을 받는 함수의 입력에 쓸 수 없다.
 */
function cloneValue(value: unknown): unknown {
  if (typeof value === 'function') return value;
  if (Array.isArray(value)) return value.map(cloneValue);
  if (
    typeof value === 'object' &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) out[key] = cloneValue(inner);
    return out;
  }
  return structuredClone(value);
}

function cloneArgs(input: readonly unknown[]): unknown[] {
  return input.map(cloneValue);
}

function run(fn: AnyFunction, input: readonly unknown[]): Outcome {
  // 두 구현이 같은 인자 객체를 공유하면 한쪽의 변경이 다른 쪽 결과를 오염시킨다.
  const args = cloneArgs(input);
  try {
    const value = (fn as (...a: unknown[]) => unknown)(...args);
    return { threw: false, value, args };
  } catch {
    // 예외는 발생 여부만 비교한다. 메시지와 타입은 구현마다 다를 수 있다.
    return { threw: true, value: undefined, args };
  }
}

export function compareBehaviour(
  original: AnyFunction,
  migrated: AnyFunction,
  inputs: readonly (readonly unknown[])[],
): BehaviourResult {
  const mismatches: Mismatch[] = [];
  inputs.forEach((input, index) => {
    const expected = run(original, input);
    const actual = run(migrated, input);
    if (expected.threw !== actual.threw) {
      mismatches.push({ index, reason: 'threw' });
    } else if (!structuralEqual(expected.value, actual.value)) {
      mismatches.push({ index, reason: 'value' });
    } else if (!structuralEqual(expected.args, actual.args)) {
      mismatches.push({ index, reason: 'args' });
    }
  });
  return { passed: mismatches.length === 0, checked: inputs.length, mismatches };
}
