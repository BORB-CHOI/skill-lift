/**
 * 실행 하나(두 턴)를 돌린다.
 *
 * 1. 첫 턴: 전환 지시. 끝나면 out/module.ts를 submission.ts로 복사한다.
 * 2. 첫 턴이 정상 종료(completed)일 때만 두 번째 턴을 `--resume <session_id>`로 돌린다.
 *    끝나면 out/migration-report.json을 report.json으로 복사한다.
 * 3. 두 턴의 도구 입력에서 네트워크 접근 시도와 조작 확인 값을 계산한다.
 *
 * 저장(transcript, meta)은 호출자가 한다. 이 함수는 실행 폴더에 산출물 사본만 쓴다.
 */
import { join } from 'node:path';
import {
  manipulationChecks,
  scanNetworkAttempts,
  type ManipulationChecks,
  type NetworkEvidence,
} from './checks.js';
import { buildArgs, runProcess, type RunConfig } from './claude.js';
import { REPORT_PATH, SUBMISSION_PATH, TURN2_TEXT, turn1Prompt } from './prompts.js';
import { classifyRun, combineTurns, type ArmExpectation, type RunState } from './state.js';
import { parseTranscript, type TokenUsage } from './stream.js';
import { copyArtifact } from './workspace.js';

export interface TwoTurnOptions {
  /** 실행 파일. 기본은 claude. 테스트에서 가짜 스크립트로 바꾼다. */
  readonly command: string;
  /** command 앞에 붙일 인자. 가짜 스크립트의 경로를 넣을 때 쓴다. */
  readonly commandPrefixArgs?: readonly string[];
  readonly workspace: string;
  readonly runDir: string;
  /** 첫 턴 앞에 붙일 슬래시 명령. baseline은 ''. */
  readonly prefix: string;
  readonly config: Omit<RunConfig, 'resumeSessionId'>;
  readonly expectation: ArmExpectation;
  /** 턴 하나의 시간 한도. */
  readonly timeoutMs: number;
  readonly env: Readonly<Record<string, string>>;
}

export interface TurnRecord {
  readonly turn: 1 | 2;
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

export interface TwoTurnResult {
  readonly state: RunState;
  readonly turns: readonly TurnRecord[];
  /** 각 턴의 stream-json 원문. transcript-1.jsonl, transcript-2.jsonl로 저장한다. */
  readonly transcripts: readonly string[];
  readonly sessionId: string | null;
  readonly model: string | null;
  readonly claudeVersion: string | null;
  /** 첫 턴 init의 Skill 목록. */
  readonly loadedSkills: readonly string[];
  readonly submission: boolean;
  readonly report: boolean;
  readonly networkAttempts: readonly NetworkEvidence[];
  readonly checks: ManipulationChecks;
}

async function runTurn(
  options: TwoTurnOptions,
  turn: 1 | 2,
  prompt: string,
  resumeSessionId: string | null,
) {
  const args = buildArgs({ ...options.config, resumeSessionId });
  const run = await runProcess({
    command: options.command,
    args: [...(options.commandPrefixArgs ?? []), ...args],
    cwd: options.workspace,
    prompt,
    timeoutMs: options.timeoutMs,
    env: options.env,
  });
  const transcript = parseTranscript(run.stdout);
  const state = classifyRun(
    { timedOut: run.timedOut, exitCode: run.exitCode, transcript },
    options.expectation,
  );
  const record: TurnRecord = {
    turn,
    state,
    sessionId: transcript.sessionId,
    numTurns: transcript.result?.numTurns ?? null,
    durationMs: run.durationMs,
    usage: transcript.result?.usage ?? null,
    subtype: transcript.result?.subtype ?? null,
    exitCode: run.exitCode,
    timedOut: run.timedOut,
    loadedSkills: transcript.init?.skills ?? [],
    deniedTools: transcript.result?.deniedTools.length ?? null,
    malformedLines: transcript.malformedLines,
  };
  return { record, transcript, stdout: run.stdout };
}

export async function runTwoTurns(options: TwoTurnOptions): Promise<TwoTurnResult> {
  const first = await runTurn(options, 1, turn1Prompt(options.prefix), null);
  const submission = copyArtifact(
    options.workspace,
    SUBMISSION_PATH,
    join(options.runDir, 'submission.ts'),
  );

  const turns: TurnRecord[] = [first.record];
  const transcripts = [first.stdout];
  const uses = [...first.transcript.toolUses];
  const network = scanNetworkAttempts(first.transcript.toolUses, 1);
  let report = false;
  let turn2State: RunState | null = null;

  // 첫 턴이 한도·오류·오염으로 끝났으면 두 번째 턴은 돌리지 않는다.
  const sessionId = first.transcript.sessionId;
  if (first.record.state === 'completed' && sessionId === null) {
    // 세션 ID가 없으면 이어 받을 수 없다. 하네스 결함으로 보고 다시 실행하게 한다.
    turn2State = 'harness';
  } else if (first.record.state === 'completed' && sessionId !== null) {
    const second = await runTurn(options, 2, TURN2_TEXT, sessionId);
    turns.push(second.record);
    transcripts.push(second.stdout);
    uses.push(...second.transcript.toolUses);
    network.push(...scanNetworkAttempts(second.transcript.toolUses, 2));
    report = copyArtifact(options.workspace, REPORT_PATH, join(options.runDir, 'report.json'));
    turn2State = second.record.state;
  }

  const init = first.transcript.init;
  return {
    state: combineTurns(first.record.state, turn2State, network.length),
    turns,
    transcripts,
    sessionId,
    model: init?.model ?? null,
    claudeVersion: init?.claudeCodeVersion ?? null,
    loadedSkills: init?.skills ?? [],
    submission,
    report,
    networkAttempts: network,
    checks: manipulationChecks(uses),
  };
}
