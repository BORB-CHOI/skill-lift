/**
 * 저장된 실행 기록으로 네트워크 검사를 다시 하고 meta.json을 고친다.
 *
 * 검사 규칙(src/runner/checks.ts)을 고친 뒤, 이미 끝난 실행에 같은 규칙을 적용하려고 쓴다.
 * 모든 실행의 networkAttempts를 새 규칙의 결과로 바꾼다. 상태는 오염(contaminated)으로 분류된 실행만
 * 다시 정한다. 아래 조건을 모두 만족할 때만 completed로 바꾸고, 아니면 그대로 두고 목록을 출력한다.
 * - 새 규칙에서 프록시 우회 시도가 0건
 * - baseline 실행이면 대상 Skill(es-toolkit:)이 로드되지 않음
 * - 두 턴 모두 정상 종료(subtype success)
 *
 * 사용: pnpm tsx scripts/rescan-network.ts <실행 이름>
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanNetworkAttempts } from '../src/runner/checks.js';
import { parseTranscript } from '../src/runner/stream.js';

interface Meta {
  arm: string;
  state: string;
  loadedSkills?: string[];
  turns?: { subtype?: string | null }[];
  networkAttempts?: unknown[];
  stateBeforeRescan?: string;
}

const [label] = process.argv.slice(2);
if (label === undefined) throw new Error('실행 이름을 주어야 한다');
const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const runsDir = join(repoRoot, 'results/es-toolkit-migrate', label);

let restored = 0;
let kept = 0;
for (const runId of readdirSync(runsDir).sort()) {
  const metaFile = join(runsDir, runId, 'meta.json');
  if (!existsSync(metaFile)) continue;
  const meta = JSON.parse(readFileSync(metaFile, 'utf8')) as Meta;
  const attempts = [1, 2].flatMap((turn) => {
    const file = join(runsDir, runId, `transcript-${turn}.jsonl`);
    if (!existsSync(file)) return [];
    return scanNetworkAttempts(parseTranscript(readFileSync(file, 'utf8')).toolUses, turn);
  });
  const next: Meta = { ...meta, networkAttempts: attempts };
  if (meta.state === 'contaminated') {
    const bypass = attempts.filter((a) => a.bypassesProxy).length;
    const skillLoaded =
      meta.arm === 'baseline' && (meta.loadedSkills ?? []).some((s) => s.startsWith('es-toolkit:'));
    const turns = meta.turns ?? [];
    const bothOk = turns.length === 2 && turns.every((t) => t.subtype === 'success');
    if (bypass === 0 && !skillLoaded && bothOk) {
      next.stateBeforeRescan = meta.state;
      next.state = 'completed';
      restored++;
    } else {
      kept++;
      console.log(
        runId,
        `오염 유지: 우회 ${bypass}건, Skill 로드 ${skillLoaded}, 두 턴 정상 ${bothOk}`,
      );
    }
  }
  writeFileSync(metaFile, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
}
console.log(`정상 종료로 복원 ${restored}개, 오염 유지 ${kept}개`);
