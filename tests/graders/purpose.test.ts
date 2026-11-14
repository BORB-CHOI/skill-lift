/**
 * 목적 기반 채점기의 관문 검사(설계 문서 10절 "채점기").
 * 고정 픽스처 과제: S(upperFirst), D(camelCase), C(padStart) 항목 하나씩.
 */
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  type CatalogEntry,
  detectEntries,
  gradeReportItem,
  gradeRun,
  itemSeed,
  loadCatalog,
  type RunGrade,
} from '../../src/graders/purpose.js';

const fixture = (path: string): string =>
  fileURLToPath(new URL(`../fixtures/purpose/${path}`, import.meta.url));

const taskDir = fixture('task-fx');
const SEED = 424242;
const COUNT = 1000;

function grade(submission: string, report: string): Promise<RunGrade> {
  return gradeRun({
    taskDir,
    submissionFile: submission,
    reportFile: report,
    seed: SEED,
    count: COUNT,
  });
}

const byType = (run: RunGrade, type: 'S' | 'D' | 'C') => {
  const item = run.items.find((i) => i.type === type);
  if (item === undefined) throw new Error(`유형 ${type} 항목이 없다`);
  return item;
};

describe('관문: 기준 해답', () => {
  let run: RunGrade;
  beforeAll(async () => {
    run = await grade(fixture('submissions/reference.ts'), fixture('reports/reference.json'));
  }, 60_000);

  it('P1과 P2가 만점이다', () => {
    expect(run.p1).toBe(1);
    expect(run.p2).toBe(1);
    expect(run.behaviourOnly).toBe(1);
    expect(byType(run, 'S').p1.entry).toBe('strict');
    expect(byType(run, 'D').p1.entry).toBe('compat');
    expect(byType(run, 'D').p2.counterexampleValid).toBe(true);
    expect(byType(run, 'C').p2.counterexampleValid).toBeNull();
  });

  it('번들 크기를 측정한다', () => {
    expect(run.bundleBytes).toBeGreaterThan(0);
  });
});

describe('관문: 원본 lodash 모듈을 그대로 제출', () => {
  let run: RunGrade;
  beforeAll(async () => {
    run = await grade(fixture('task-fx/src/module.ts'), fixture('reports/reference.json'));
  }, 60_000);

  it('동작 보존은 통과하고 모든 항목이 진입점에서 틀린다', () => {
    expect(run.behaviourOnly).toBe(1);
    for (const item of run.items) {
      expect(item.p1.behaviour).toBe(true);
      expect(item.p1.entry).toBe('lodash');
      expect(item.p1.entryOk).toBe(false);
      expect(item.p1.score).toBe(0);
    }
    expect(run.p1).toBe(0);
  });
});

describe('관문: compat 일괄 치환', () => {
  it('S 항목만 틀린다', async () => {
    const run = await grade(
      fixture('submissions/all-compat.ts'),
      fixture('reports/reference.json'),
    );
    expect(byType(run, 'S').p1).toMatchObject({ behaviour: true, entry: 'compat', score: 0 });
    expect(byType(run, 'D').p1.score).toBe(1);
    expect(byType(run, 'C').p1.score).toBe(1);
  }, 60_000);
});

describe('관문: 보고서', () => {
  it('범위 밖 반례는 0점이다', async () => {
    const run = await grade(
      fixture('submissions/reference.ts'),
      fixture('reports/out-of-range.json'),
    );
    expect(byType(run, 'D').p2).toMatchObject({
      claimed: false,
      counterexampleValid: false,
      score: 0,
    });
    expect(byType(run, 'S').p2.score).toBe(1);
  }, 60_000);

  it('보고서가 없으면 P2는 모두 0점이다', async () => {
    const run = await grade(fixture('submissions/reference.ts'), fixture('reports/missing.json'));
    expect(run.p2).toBe(0);
    expect(run.items.every((i) => !i.p2.present)).toBe(true);
    expect(run.p1).toBe(1);
  }, 60_000);
});

describe('보고서 항목 채점', () => {
  let camel: CatalogEntry;
  beforeAll(async () => {
    const found = (await loadCatalog()).find((e) => e.name === 'toPropName');
    if (found === undefined) throw new Error('catalog에 toPropName이 없다');
    camel = found;
  });
  const line = (claimed: boolean, counterexample: unknown) => [
    { lodash: 'camelCase', strictSameAsLodash: claimed, counterexample },
  ];

  it('S 항목에 유효한 반례가 나오면 1점을 주고 재분류 표시를 단다', () => {
    const item = { fn: 'camelCase', name: 'toPropName', type: 'S' as const };
    const result = gradeReportItem(item, camel, line(false, ['vu__déjà']));
    expect(result.p2.score).toBe(1);
    expect(result.reclassify).toBe(true);
  });

  it('D 항목에 true를 주장하거나 반례가 무효면 0점이다', () => {
    const item = { fn: 'camelCase', name: 'toPropName', type: 'D' as const };
    expect(gradeReportItem(item, camel, line(true, null)).p2.score).toBe(0);
    expect(gradeReportItem(item, camel, line(false, null)).p2.score).toBe(0);
    expect(gradeReportItem(item, camel, line(false, ['userId'])).p2.score).toBe(0);
  });

  it('반례를 JavaScript 배열 리터럴 문자열로도 받는다', () => {
    const item = { fn: 'camelCase', name: 'toPropName', type: 'D' as const };
    expect(gradeReportItem(item, camel, line(false, '["vu__déjà"]')).p2.score).toBe(1);
    expect(gradeReportItem(item, camel, line(false, '[`vu__déjà`]')).p2.score).toBe(1);
    // 허용 목록 밖 구문, 배열이 아닌 값, 범위 밖 값은 무효다.
    expect(gradeReportItem(item, camel, line(false, '[String("vu__déjà")]')).p2.score).toBe(0);
    expect(gradeReportItem(item, camel, line(false, '"vu__déjà"')).p2.score).toBe(0);
    expect(gradeReportItem(item, camel, line(false, '[undefined]')).p2.score).toBe(0);
  });
});

describe('진입점 판별', () => {
  it('보조 함수를 따라가고 여러 진입점이 섞이면 mixed로 본다', () => {
    const source = `
      import * as _ from 'lodash';
      import { camelCase } from 'es-toolkit';
      import { padStart } from 'es-toolkit/compat/padStart';
      import type { Dictionary } from 'lodash';
      const helper = (s: string) => camelCase(s);
      function both(s: string) { return _.upperFirst(helper(s)); }
      export function a(s: string): string { return helper(s); }
      export function b(s: string): string { return both(s); }
      export const c = (n: number): string => padStart(String(n), 4, '0');
      export function d(s: Dictionary<string>): string { return s.x ?? ''; }
    `;
    expect(detectEntries(source, ['a', 'b', 'c', 'd', 'e'])).toEqual({
      a: 'strict',
      b: 'mixed',
      c: 'compat',
      d: 'none',
      e: 'none',
    });
  });

  it('매개변수가 import 이름을 가리면 import로 세지 않는다', () => {
    const source = `
      import values from 'lodash/values';
      import { zipObject } from 'es-toolkit';
      import { keyBy } from 'es-toolkit/compat';
      export function toRecord(keys: string[], values: number[]) { return zipObject(keys, values); }
      export function settingValues(config: Record<string, unknown>) { return values(config); }
      export function local(rows: { id: number }[]) {
        const keyBy = (r: { id: number }[]) => r;
        return { keyBy: keyBy(rows) };
      }
      export function shorthand(config: Record<string, unknown>) { return { values }.values(config); }
    `;
    expect(detectEntries(source, ['toRecord', 'settingValues', 'local', 'shorthand'])).toEqual({
      toRecord: 'strict',
      settingValues: 'lodash',
      local: 'none',
      shorthand: 'lodash',
    });
  });
});

describe('항목 시드', () => {
  it('항목 이름마다 다르고 재현된다', () => {
    expect(itemSeed(1, 'toSentence')).toBe(itemSeed(1, 'toSentence'));
    expect(itemSeed(1, 'toSentence')).not.toBe(itemSeed(1, 'toPropName'));
  });
});
