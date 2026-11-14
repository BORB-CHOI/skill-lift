/**
 * 프로젝트 단위 실행 기록(transcript.jsonl)에 현재 검사 규칙을 다시 적용하고 meta.json을 고친다.
 *
 * 검사 규칙(src/runner/checks.ts)을 고친 뒤 이미 끝난 실행에 같은 규칙을 적용하려고 쓴다.
 * networkAttempts, answerAccess, 조작 확인 값을 새 규칙의 결과로 바꾼다.
 * 상태는 오염(contaminated)이던 실행만 다시 정한다. 우회 시도와 정답 접근이 모두 0건이면
 * 턴 상태(meta.turn.state)로 되돌리고 바꾸기 전 상태를 stateBeforeRescan에 남긴다.
 *
 * 사용: pnpm tsx scripts/rescan-checks.ts <실행 결과 폴더>
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { manipulationChecks, scanAnswerAccess, scanNetworkAttempts } from '../src/runner/checks.js';
import { parseTranscript } from '../src/runner/stream.js';

interface Meta {
  state: string;
  turn?: { state?: string };
  stateBeforeRescan?: string;
  [key: string]: unknown;
}

const [runsDir] = process.argv.slice(2);
if (runsDir === undefined) throw new Error('실행 결과 폴더를 주어야 한다');

let restored = 0;
let kept = 0;
for (const runId of readdirSync(runsDir).sort()) {
  const metaFile = join(runsDir, runId, 'meta.json');
  const transcriptFile = join(runsDir, runId, 'transcript.jsonl');
  if (!existsSync(metaFile) || !existsSync(transcriptFile)) continue;
  const meta = JSON.parse(readFileSync(metaFile, 'utf8')) as Meta;
  const uses = parseTranscript(readFileSync(transcriptFile, 'utf8')).toolUses;
  const networkAttempts = scanNetworkAttempts(uses, 1);
  const answerAccess = scanAnswerAccess(uses);
  const next: Meta = { ...meta, networkAttempts, answerAccess, ...manipulationChecks(uses) };
  if (meta.state === 'contaminated') {
    const bypass = networkAttempts.filter((n) => n.bypassesProxy).length;
    const turnState = meta.turn?.state;
    if (
      bypass === 0 &&
      answerAccess.length === 0 &&
      turnState !== undefined &&
      turnState !== 'contaminated'
    ) {
      next.stateBeforeRescan = meta.state;
      next.state = turnState;
      restored++;
    } else {
      kept++;
      console.log(
        runId,
        `오염 유지: 우회 ${bypass}건, 정답 접근 ${answerAccess.length}건, 턴 상태 ${turnState}`,
      );
    }
  }
  writeFileSync(metaFile, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
}
console.log(`복원 ${restored}개, 오염 유지 ${kept}개`);
