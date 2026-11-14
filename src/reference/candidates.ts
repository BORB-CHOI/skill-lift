/**
 * 후보 조합 생성.
 *
 * 과제 파일의 lodash import 줄마다 선택지가 있다: 그대로 두기(keep)와 사전 등록한 후보들.
 * 모든 조합을 만들어 두면 "동작이 보존되는 것 중 가장 작은 조합"을 사람의 판단 없이 구할 수 있다.
 */
import type { Slot } from '../tasks/spec.js';

export const KEEP = 'keep';

export interface Candidate {
  /** 슬롯 이름 → 고른 후보 이름. */
  readonly choices: Readonly<Record<string, string>>;
  readonly code: string;
}

function countOccurrences(text: string, needle: string): number {
  if (needle === '') return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const at = text.indexOf(needle, from);
    if (at === -1) return count;
    count++;
    from = at + needle.length;
  }
}

/** 원본에 각 슬롯의 import 줄이 정확히 한 번씩 있는지 확인한다. */
export function assertSlotsMatchSource(source: string, slots: readonly Slot[]): void {
  const names = new Set<string>();
  for (const slot of slots) {
    if (names.has(slot.name)) throw new Error(`슬롯 이름이 겹친다: ${slot.name}`);
    names.add(slot.name);
    const count = countOccurrences(source, slot.original);
    if (count !== 1) {
      throw new Error(`슬롯 "${slot.name}"의 원본 줄이 소스에 ${count}번 나온다 (1번이어야 한다)`);
    }
  }
}

export function enumerateCandidates(source: string, slots: readonly Slot[]): Candidate[] {
  assertSlotsMatchSource(source, slots);
  let partial: Candidate[] = [{ choices: {}, code: source }];
  for (const slot of slots) {
    const options: [string, string][] = [[KEEP, slot.original], ...Object.entries(slot.variants)];
    const next: Candidate[] = [];
    for (const base of partial) {
      for (const [name, replacement] of options) {
        next.push({
          choices: { ...base.choices, [slot.name]: name },
          code: base.code.replace(slot.original, () => replacement),
        });
      }
    }
    partial = next;
  }
  return partial;
}

/** 모든 슬롯에서 같은 이름의 후보를 고른 조합. 그 후보가 없는 슬롯이 하나라도 있으면 null. */
export function uniformCandidate(
  source: string,
  slots: readonly Slot[],
  choice: string,
): Candidate | null {
  assertSlotsMatchSource(source, slots);
  const choices: Record<string, string> = {};
  let code = source;
  for (const slot of slots) {
    const replacement = choice === KEEP ? slot.original : slot.variants[choice];
    if (replacement === undefined) return null;
    choices[slot.name] = choice;
    code = code.replace(slot.original, () => replacement);
  }
  return { choices, code };
}
