// 변경 이력(v1.49.0~v1.53.2)에 나온 함수가 lodash, es-toolkit strict, compat에 있는지 설치본으로 확인한다.
import { createRequire } from 'node:module';
import * as strict from 'es-toolkit';
import * as compat from 'es-toolkit/compat';

const require = createRequire(import.meta.url);
const lodash = require('lodash') as Record<string, unknown>;
const names =
  `truncate isError words startCase deburr orderBy sortBy once split countBy toString maxBy minBy meanBy groupBy
add subtract multiply divide ceil floor round dropWhile dropRightWhile some pull pullAll pullAllBy remove xorBy xorWith reduce
reduceRight forEach forIn forOwn unionWith cloneDeep cloneDeepWith isMatch matches debounce mergeWith has hasIn differenceWith
without findLastIndex set find indexOf toPath omit map size intersectionBy intersectionWith difference differenceBy uniqBy
unionBy iteratee reverse toArray zipObject sampleSize takeWhile takeRightWhile chunk lastIndexOf last findIndex every nth
inRange values includes camelCase kebabCase snakeCase upperFirst pad padStart padEnd unset pick random trimStart defaultsDeep
template pickBy findLast clone pullAt partition unzipWith invokeMap flattenDeep merge keyBy mapValues mapKeys isEqual escape
capitalize sum sumBy range clamp toNumber isEmpty uniq compact head`
    .split(/\s+/)
    .filter(Boolean);

const has = (o: unknown, n: string) => typeof (o as Record<string, unknown>)[n] === 'function';
const rows = names.map((n) => ({
  n,
  lodash: has(lodash, n),
  strict: has(strict, n),
  compat: has(compat, n),
}));
console.log(
  'strict 없음(compat 전용 후보):',
  rows
    .filter((r) => r.lodash && !r.strict && r.compat)
    .map((r) => r.n)
    .join(' '),
);
console.log(
  'strict·compat 둘 다:',
  rows
    .filter((r) => r.lodash && r.strict && r.compat)
    .map((r) => r.n)
    .join(' '),
);
console.log(
  'compat 없음:',
  rows
    .filter((r) => r.lodash && !r.compat)
    .map((r) => r.n)
    .join(' '),
);
console.log(
  'lodash 없음:',
  rows
    .filter((r) => !r.lodash)
    .map((r) => r.n)
    .join(' '),
);
