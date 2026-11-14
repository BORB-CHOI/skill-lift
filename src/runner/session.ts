/**
 * 실행 하나(한 턴)를 돌린다.
 *
 * 1. 작업 폴더에서 `claude -p`를 한 번 실행한다. 산출물은 작업 폴더의 변경이다.
 * 2. 도구 입력에서 네트워크 접근 시도와 조작 확인 값을 계산한다.
 *
 * 작업 폴더 준비, 변경 저장, 정리는 호출자가 한다. 이 함수는 작업 폴더에 아무것도 쓰지 않는다.
 */
import {
  manipulationChecks,
  scanAnswerAccess,
  scanNetworkAttempts,
  type AnswerAccessEvidence,
  type ManipulationChecks,
  type NetworkEvidence,
} from './checks.js';
import { buildArgs, runProcess, type RunConfig } from './claude.js';
import { projectPrompt } from './prompts.js';
import { classifyRun, finalState, type ArmExpectation, type RunState } from './state.js';
import { parseTranscript, type TokenUsage } from './stream.js';

export interface SessionOptions {
  /** 실행 파일. 기본은 claude. 테스트에서 가짜 스크립트로 바꾼다. */
  readonly command: string;
  /** command 앞에 붙일 인자. 가짜 스크립트의 경로를 넣을 때 쓴다. */
  readonly commandPrefixArgs?: readonly string[];
  readonly workspace: string;
  /** 지시문 앞에 붙일 슬래시 명령. baseline은 ''. */
  readonly prefix: string;
  readonly config: Omit<RunConfig, 'resumeSessionId'>;
  readonly expectation: ArmExpectation;
  readonly timeoutMs: number;
  readonly env: Readonly<Record<string, string>>;
}

export interface TurnRecord {
  /** 네트워크 검사를 반영하기 전의 상태. */
  readonly state: RunState;
  readonly sessionId: string | null;
  /** 에이전트 턴 수(result.num_turns). */
  readonly numTurns: number | null;
  /** 프로세스 시작부터 종료까지의 벽시계 시간. */
  readonly durationMs: number;
  readonly usage: TokenUsage | null;
  readonly subtype: string | null;
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly loadedSkills: readonly string[];
  readonly deniedTools: number | null;
  readonly malformedLines: number;
}

export interface SessionResult {
  readonly state: RunState;
  readonly turn: TurnRecord;
  /** stream-json 원문. transcript.jsonl로 저장한다. */
  readonly transcript: string;
  /** 프로세스의 표준 오류 출력. 인프라 실패의 원인을 볼 때 쓴다. */
  readonly stderr: string;
  readonly sessionId: string | null;
  readonly model: string | null;
  readonly claudeVersion: string | null;
  readonly loadedSkills: readonly string[];
  readonly networkAttempts: readonly NetworkEvidence[];
  /** 작업 폴더 밖 정답 자료에 접근한 기록. 하나라도 있으면 오염이다. */
  readonly answerAccess: readonly AnswerAccessEvidence[];
  readonly checks: ManipulationChecks;
}

export async function runProjectSession(options: SessionOptions): Promise<SessionResult> {
  const run = await runProcess({
    command: options.command,
    args: [...(options.commandPrefixArgs ?? []), ...buildArgs(options.config)],
    cwd: options.workspace,
    prompt: projectPrompt(options.prefix),
    timeoutMs: options.timeoutMs,
    env: options.env,
  });
  const transcript = parseTranscript(run.stdout);
  const turnState = classifyRun(
    { timedOut: run.timedOut, exitCode: run.exitCode, transcript },
    options.expectation,
  );
  const init = transcript.init;
  const network = scanNetworkAttempts(transcript.toolUses, 1);
  const answerAccess = scanAnswerAccess(transcript.toolUses);
  return {
    // 프록시를 우회할 수 있는 시도와 정답 자료 접근만 오염으로 센다.
    // 나머지 네트워크 시도는 차단된 시도로 기록만 한다.
    state: finalState(
      turnState,
      network.filter((n) => n.bypassesProxy).length + answerAccess.length,
    ),
    answerAccess,
    turn: {
      state: turnState,
      sessionId: transcript.sessionId,
      numTurns: transcript.result?.numTurns ?? null,
      durationMs: run.durationMs,
      usage: transcript.result?.usage ?? null,
      subtype: transcript.result?.subtype ?? null,
      exitCode: run.exitCode,
      timedOut: run.timedOut,
      loadedSkills: init?.skills ?? [],
      deniedTools: transcript.result?.deniedTools.length ?? null,
      malformedLines: transcript.malformedLines,
    },
    transcript: run.stdout,
    stderr: run.stderr,
    sessionId: transcript.sessionId,
    model: init?.model ?? null,
    claudeVersion: init?.claudeCodeVersion ?? null,
    loadedSkills: init?.skills ?? [],
    networkAttempts: network,
    checks: manipulationChecks(transcript.toolUses),
  };
}
