/**
 * 후보 항목의 유형 분류(설계 문서 4.2).
 *
 * 항목마다 export 함수를 세 벌 만든다. 본문의 lodash 호출을 lodash, es-toolkit strict, compat 함수로
 * 바꾼 것이다. 생성 입력에 넣어 lodash 판과 비교하고 유형을 정한다.
 * - S: strict가 lodash와 같다
 * - D: strict가 다르고 compat은 같다
 * - C: strict에 함수가 없고 compat은 같다
 * - X: strict도 compat도 lodash와 같지 않다
 *
 * 분류용 시드는 본 채점의 비공개 시드와 다르다. 결과는 suites/es-toolkit/migrate/classification.json에 쓴다.
 *
 * 사용: pnpm tsx scripts/classify-functions.ts [입력 수]
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as strict from 'es-toolkit';
import * as compat from 'es-toolkit/compat';
import { compareBehaviour, type AnyFunction } from '../src/graders/behaviour.js';
import { mulberry32 } from '../src/stats/paired.js';
import { toLiteral } from '../src/graders/literal-format.js';
import { buildWrapper, type CatalogEntry } from '../src/graders/purpose.js';
// @ts-expect-error 생성기 목록은 타입 선언이 없는 .mjs다.
import { catalog } from '../suites/es-toolkit/migrate/catalog.mjs';

interface Entry {
  fn: string;
  name: string;
  params: string;
  body: string;
  make: (random: () => number) => unknown[];
  check: (args: unknown[]) => boolean;
}

const CLASSIFY_SEED = 20261114;
// 3,000개에서는 compat의 드문 불일치(omit)를 놓쳤다. 분류는 20,000개로 한다.
const count = Number(process.argv[2] ?? 20000);
const require = createRequire(import.meta.url);
const lodash = require('lodash') as Record<string, unknown>;
const outFile = fileURLToPath(
  new URL('../suites/es-toolkit/migrate/classification.json', import.meta.url),
);

/** 본문의 fn 호출을 impl로 바꾼 export 함수. 채점기와 같은 구현을 쓴다. */
const wrapper = (entry: Entry, impl: unknown): AnyFunction =>
  buildWrapper(entry as unknown as CatalogEntry, impl);

const results = [];
for (const entry of catalog as Entry[]) {
  const random = mulberry32(CLASSIFY_SEED);
  const inputs = Array.from({ length: count }, () => entry.make(random));
  const outOfRange = inputs.filter((a) => !entry.check(a)).length;
  const original = wrapper(entry, lodash[entry.fn]);
  const s = (strict as Record<string, unknown>)[entry.fn];
  const c = (compat as Record<string, unknown>)[entry.fn];
  const cmp = (impl: unknown) => {
    if (typeof impl !== 'function') return null;
    const r = compareBehaviour(original, wrapper(entry, impl), inputs);
    const first = r.mismatches[0];
    return {
      mismatches: r.mismatches.length,
      example: first === undefined ? null : toLiteral(inputs[first.index]),
    };
  };
  const sr = cmp(s);
  const cr = cmp(c);
  const strictSame = sr !== null && sr.mismatches === 0;
  const compatSame = cr !== null && cr.mismatches === 0;
  const type = strictSame ? 'S' : compatSame ? (sr === null ? 'C' : 'D') : 'X';
  results.push({
    fn: entry.fn,
    name: entry.name,
    type,
    strictMismatches: sr?.mismatches ?? null,
    compatMismatches: cr?.mismatches ?? null,
    strictExample: sr?.example ?? null,
    outOfRange,
  });
  console.log(
    entry.fn.padEnd(14),
    type,
    `strict ${String(sr?.mismatches ?? '없음').padStart(5)}`,
    `compat ${String(cr?.mismatches ?? '없음').padStart(5)}`,
    outOfRange > 0 ? `범위 밖 생성 ${outOfRange}` : '',
  );
}
writeFileSync(
  outFile,
  `${JSON.stringify({ seed: CLASSIFY_SEED, count, results }, null, 2)}\n`,
  'utf8',
);
