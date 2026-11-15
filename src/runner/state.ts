/**
 * 실행 하나의 상태 분류.
 *
 * 측정 실패가 결과에 섞이지 않게 실행을 상태로 나눈다. 모델 쪽 실패(시간·턴 한도)는
 * 분석에 0점으로 들어가고, 하네스와 인프라의 실패는 다시 실행한다. 이 구분이 없으면
 * 예외로 죽은 실행이 "실패"나 "통과"로 집계된다.
 */
import type { Transcript } from './stream.js';

export type RunState =
  /** 정상 종료. 산출물을 채점한다. */
  | 'completed'
  /** 시간 한도나 턴 한도에 걸렸다. 분석에는 0점으로 넣는다. */
  | 'limit'
  /** 프로세스 오류, API 오류, 사용 한도. arm과 무관한 규칙으로 다시 실행한다. */
  | 'infra'
  /**
   * 오염. 대조 arm에 평가 대상 Skill이 로드됐거나, 도구 입력에 외부 네트워크 접근 시도가 있다.
   * 분석에서 빼고 arm별 개수를 보고한다.
   */
  | 'contaminated'
  /** 처리 arm인데 평가 대상 Skill이 로드 목록에 없다. 하네스의 결함이다. */
  | 'harness';

export interface RunOutcome {
  readonly timedOut: boolean;
  readonly exitCode: number | null;
  readonly transcript: Transcript;
}

export interface ArmExpectation {
  /** 이 arm에서 로드돼야 하는 Skill 이름. 대조 arm은 null. */
  readonly expectedSkill: string | null;
  /** 어느 arm에서도 로드되면 안 되는 Skill 이름의 접두(예: "es-toolkit:"). */
  readonly targetPrefix: string;
}

export function classifyRun(outcome: RunOutcome, arm: ArmExpectation): RunState {
  const { init, result } = outcome.transcript;
  if (outcome.timedOut) return 'limit';
  // init 메시지가 없는 실행은 에이전트가 시작하지 못한 실행이다.
  if (init === null) return 'infra';

  const loaded = init.skills.filter((skill) => skill.startsWith(arm.targetPrefix));
  if (arm.expectedSkill === null) {
    if (loaded.length > 0) return 'contaminated';
  } else if (!loaded.includes(arm.expectedSkill)) {
    return 'harness';
  }

  if (result === null) return 'infra';
  if (result.subtype === 'error_max_turns') return 'limit';
  if (result.isError || result.subtype !== 'success') return 'infra';
  return 'completed';
}

/**
 * 턴 상태와 네트워크 검사 결과로 실행 하나의 상태를 정한다.
 *
 * 1. infra·harness면 그 상태다. 실행 전체를 다시 한다.
 * 2. 프록시를 우회할 수 있는 접근 시도가 있으면 contaminated다. 한도에 걸린 실행이어도 오염이 우선한다.
 * 3. 그 밖에는 턴 상태 그대로다(completed, limit, 대조 arm에 대상 Skill이 로드된 contaminated).
 */
export function finalState(turn: RunState, bypassAttempts: number): RunState {
  if (turn === 'infra' || turn === 'harness') return turn;
  if (bypassAttempts > 0) return 'contaminated';
  return turn;
}
