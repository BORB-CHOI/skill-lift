/**
 * 항목 후보 목록. 항목 하나는 lodash 함수 하나를 감싼 export 함수 하나다.
 *
 * 필드:
 * - fn: lodash 함수 이름. 과제 모듈의 import 이름과 본문의 호출 이름으로 그대로 쓴다.
 * - name: export 함수 이름.
 * - params: TypeScript 매개변수 선언. 이름만 뽑아 JS 함수 매개변수로도 쓴다.
 * - returns: TypeScript 반환 타입.
 * - body: 함수 본문(한 줄). fn 이름으로 lodash 함수를 호출한다.
 * - doc: JSDoc 한 줄. 타입이 허용하는 값의 범위만 쓰고 동작이 갈리는 값을 따로 짚지 않는다.
 * - make(random): 범위 안의 인자 배열 하나를 만든다.
 * - check(args): 인자 배열이 범위 안이면 true.
 *
 * 생성기와 검사기는 같은 범위 정의에서 나온다. 반례 검증에는 check만 쓴다.
 */

const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
const int = (r, a, b) => a + Math.floor(r() * (b - a + 1));
const list = (r, a, b, make) => Array.from({ length: int(r, a, b) }, () => make());

const isInt = (x, a, b) => Number.isInteger(x) && x >= a && x <= b;
const isStr = (x, max) => typeof x === 'string' && [...x].length <= max;
const isArr = (x, max, each) =>
  Array.isArray(x) && x.length <= max && x.every((v, i) => i in x && each(v));
const isPlain = (x) =>
  typeof x === 'object' && x !== null && Object.getPrototypeOf(x) === Object.prototype;

// 사용자 입력 문자열: 라틴 확장, 한글, 이모지, 결합 문자, 숫자, 구두점을 섞는다.
const TEXT_CHARS = [
  ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  ...' -_.,!?/\'"&<>',
  'é',
  'ü',
  'ñ',
  'Ç',
  'ß',
  'Ø',
  'œ',
  'ǅ',
  'İ',
  '한',
  '글',
  'ア',
  '٣',
  '½',
  'é',
  '👍',
  '👩‍💻',
  '🇰🇷',
  ' ',
  '\t',
];
const text = (r, max) => {
  let s = '';
  const n = int(r, 0, max);
  for (let i = 0; i < n; i++) s += pick(r, TEXT_CHARS);
  return s;
};
// TEXT_CHARS의 원소 하나는 코드 포인트 최대 3개다('👩‍💻').
const isText = (x, max) => typeof x === 'string' && [...x].length <= max * 3;

const IDENT_PARTS = [
  'user',
  'id',
  'API',
  'url',
  'HTML',
  'parse',
  'v2',
  '2nd',
  'XMLHttp',
  'Request',
  'déjà',
  'vu',
  'iOS',
  '15',
];
const ident = (r) => {
  let s = '';
  const n = int(r, 0, 4);
  for (let i = 0; i < n; i++)
    s += pick(r, IDENT_PARTS) + pick(r, ['', '', '_', '-', ' ', '.', '__']);
  return s;
};

const NAMES = ['kim', 'lee', 'park', 'choi', 'jung'];
const num = (r) => pick(r, [int(r, -5, 99), int(r, -5, 99), Math.round(r() * 1000) / 100, -0, NaN]);
const isNum = (x) => typeof x === 'number' && (Number.isNaN(x) || (x >= -5 && x <= 99));
const row = (r) => ({
  id: int(r, 0, 9),
  name: pick(r, NAMES),
  age: pick(r, [int(r, 18, 60), null]),
  score: num(r),
});
const isRow = (x) =>
  isPlain(x) &&
  Object.keys(x).length === 4 &&
  isInt(x.id, 0, 9) &&
  NAMES.includes(x.name) &&
  (x.age === null || isInt(x.age, 18, 60)) &&
  isNum(x.score);
const rows = (r) => list(r, 0, 10, () => row(r));
const isRows = (x) => isArr(x, 10, isRow);
const ints = (r) => list(r, 0, 12, () => int(r, -5, 20));
const isInts = (x) => isArr(x, 12, (v) => isInt(v, -5, 20));
const nums = (r) => list(r, 0, 12, () => num(r));
const isNums = (x) => isArr(x, 12, isNum);
const maybe = (r, v) => (r() < 0.15 ? pick(r, [null, undefined]) : v);
const isMaybe = (x, ok) => x === null || x === undefined || ok(x);

const KEYS = ['theme', 'size', 'items', 'enabled', 'label', 'a.b', '0', 'constructor'];
const scalar = (r) => pick(r, [int(r, -5, 99), 'x', '', true, false, null]);
const isScalar = (x) =>
  x === null || typeof x === 'boolean' || x === 'x' || x === '' || isInt(x, -5, 99);
const obj = (r, depth) => {
  const o = {};
  const n = int(r, 0, 4);
  for (let i = 0; i < n; i++)
    o[pick(r, KEYS)] = depth > 0 && r() < 0.3 ? obj(r, depth - 1) : scalar(r);
  return o;
};
const isObj = (x, depth) =>
  isPlain(x) &&
  Object.keys(x).every((k) => KEYS.includes(k)) &&
  Object.values(x).every((v) => isScalar(v) || (depth > 0 && isObj(v, depth - 1)));
const path = (r) =>
  pick(r, [
    'theme',
    'items',
    'a.b',
    'a[0]',
    'size.0',
    '0',
    'constructor',
    ['a', 'b'],
    ['items', '0'],
  ]);
const isPath = (x) =>
  (typeof x === 'string' && x.length <= 12) ||
  (Array.isArray(x) && x.length <= 3 && x.every((s) => typeof s === 'string'));

const T_TEXT = (max) =>
  `길이 ${max}자 이하의 사용자 입력 문자열이다. 라틴·한글·일본어 문자, 이모지, 숫자, 공백, 구두점을 포함할 수 있다.`;
const T_IDENT =
  '영문·숫자 단어를 공백, 하이픈, 밑줄, 마침표로 이은 식별자 문자열이다. 대소문자가 섞이고 악센트 문자가 들어갈 수 있다.';
const T_ROWS =
  'rows는 길이 0~10의 배열이고 원소는 { id: 0~9 정수, name: 소문자 이름, age: 18~60 정수 또는 null, score: -5~99의 수 또는 NaN }이다.';
const T_NUMS = '길이 0~12의 배열이고 원소는 -5~99의 수(소수, -0, NaN 포함)다.';
const T_INTS = '길이 0~12의 배열이고 원소는 -5~20의 정수다.';
const T_OBJ =
  '깊이 2 이하의 설정 객체다. 키는 정해진 설정 키이고 값은 정수, 문자열, 불리언, null 또는 객체다.';

const one = (gen, chk) => ({ make: (r) => [gen(r)], check: (a) => a.length === 1 && chk(a[0]) });

// 범위 검사가 열거로 정의되는 값들
const DISPLAY_VALUES = (r) => [
  num(r),
  'x',
  null,
  undefined,
  [1, null, 'a'],
  [, 2],
  [[1, [2]], undefined],
  [],
];
const isDisplay = (x) =>
  x === null ||
  x === undefined ||
  x === 'x' ||
  isNum(x) ||
  (Array.isArray(x) && x.length <= 3 && JSON.stringify(x).length <= 20);
const isBlankInput = (x) =>
  x === '' ||
  x === 'x' ||
  x === 0 ||
  x === 7 ||
  x === true ||
  x === null ||
  x === undefined ||
  (Array.isArray(x) && x.length <= 1) ||
  isObj(x, 1);
const isNested = (x, depth) =>
  Array.isArray(x) &&
  x.length <= 4 &&
  x.every((v) => isInt(v, 0, 9) || (depth > 0 && isNested(v, depth - 1)));
const isMoney = (x) => typeof x === 'number' && (Number.isNaN(x) || (x >= -5 && x <= 100));
const names = (r) => list(r, 0, 8, () => pick(r, [...NAMES, '', 'kim', 'lee']));
const isNames = (x) => isArr(x, 8, (v) => v === '' || NAMES.includes(v));
const mixed = (r) =>
  list(r, 0, 10, () => pick(r, [0, 1, 7, '', 'x', null, undefined, false, true, NaN]));
const isMixed = (x) =>
  isArr(
    x,
    10,
    (v) => [0, 1, 7, '', 'x', null, undefined, false, true].includes(v) || Number.isNaN(v),
  );
const pairs = (r) => list(r, 0, 6, () => [pick(r, NAMES), int(r, -5, 99)]);
const isPairs = (x) =>
  isArr(
    x,
    6,
    (p) => Array.isArray(p) && p.length === 2 && NAMES.includes(p[0]) && isInt(p[1], -5, 99),
  );
const T_NAMES = '길이 0~8의 배열이고 원소는 소문자 이름이나 빈 문자열이다(중복 가능).';

export const catalog = [
  // 문자열: 대소문자 변환 계열
  {
    fn: 'camelCase',
    name: 'toPropName',
    params: 'key: string',
    returns: 'string',
    body: 'return camelCase(key);',
    doc: T_IDENT,
    ...one(ident, (x) => isStr(x, 80)),
  },
  {
    fn: 'kebabCase',
    name: 'toSlug',
    params: 'title: string',
    returns: 'string',
    body: 'return kebabCase(title);',
    doc: T_TEXT(30),
    ...one(
      (r) => text(r, 30),
      (x) => isText(x, 30),
    ),
  },
  {
    fn: 'snakeCase',
    name: 'toColumn',
    params: 'key: string',
    returns: 'string',
    body: 'return snakeCase(key);',
    doc: T_IDENT,
    ...one(ident, (x) => isStr(x, 80)),
  },
  {
    fn: 'startCase',
    name: 'toHeading',
    params: 'title: string',
    returns: 'string',
    body: 'return startCase(title);',
    doc: T_TEXT(30),
    ...one(
      (r) => text(r, 30),
      (x) => isText(x, 30),
    ),
  },
  {
    fn: 'upperFirst',
    name: 'toSentence',
    params: 'text: string',
    returns: 'string',
    body: 'return upperFirst(text);',
    doc: T_TEXT(20),
    ...one(
      (r) => text(r, 20),
      (x) => isText(x, 20),
    ),
  },
  {
    fn: 'capitalize',
    name: 'toLabel',
    params: 'text: string',
    returns: 'string',
    body: 'return capitalize(text);',
    doc: T_TEXT(20),
    ...one(
      (r) => text(r, 20),
      (x) => isText(x, 20),
    ),
  },
  {
    fn: 'words',
    name: 'tokenize',
    params: 'text: string',
    returns: 'string[]',
    body: 'return words(text);',
    doc: T_TEXT(40),
    ...one(
      (r) => text(r, 40),
      (x) => isText(x, 40),
    ),
  },
  {
    fn: 'deburr',
    name: 'foldAccents',
    params: 'name: string',
    returns: 'string',
    body: 'return deburr(name);',
    doc: T_TEXT(30),
    ...one(
      (r) => text(r, 30),
      (x) => isText(x, 30),
    ),
  },
  {
    fn: 'escape',
    name: 'toHtmlText',
    params: 'text: string',
    returns: 'string',
    body: 'return escape(text);',
    doc: T_TEXT(40),
    ...one(
      (r) => text(r, 40),
      (x) => isText(x, 40),
    ),
  },
  {
    fn: 'pad',
    name: 'center',
    params: 'text: string, width: number',
    returns: 'string',
    body: "return pad(text, width, '·');",
    doc: `text는 ${'길이 12자 이하의 사용자 입력 문자열'}이고 width는 0~20의 정수다.`,
    make: (r) => [text(r, 12), int(r, 0, 20)],
    check: (a) => a.length === 2 && isText(a[0], 12) && isInt(a[1], 0, 20),
  },
  {
    fn: 'trimStart',
    name: 'stripLeading',
    params: 'text: string',
    returns: 'string',
    body: "return trimStart(text, '-_ ');",
    doc: T_TEXT(20),
    ...one(
      (r) => pick(r, ['', '--', '_ -', ' ']) + text(r, 20),
      (x) => isText(x, 24),
    ),
  },
  {
    fn: 'truncate',
    name: 'preview',
    params: 'text: string',
    returns: 'string',
    body: "return truncate(text, { length: 16, separator: ' ' });",
    doc: T_TEXT(40),
    ...one(
      (r) => text(r, 40),
      (x) => isText(x, 40),
    ),
  },
  {
    fn: 'padStart',
    name: 'toCode',
    params: 'n: number',
    returns: 'string',
    body: "return padStart(String(n), 4, '0');",
    doc: 'n은 -5~99의 수(소수, -0, NaN 포함)다.',
    ...one(num, isNum),
  },
  {
    fn: 'split',
    name: 'toChars',
    params: 'text: string',
    returns: 'string[]',
    body: "return split(text, '');",
    doc: T_TEXT(20),
    ...one(
      (r) => text(r, 20),
      (x) => isText(x, 20),
    ),
  },
  {
    fn: 'toString',
    name: 'display',
    params: 'value: unknown',
    returns: 'string',
    body: 'return toString(value);',
    doc: '값은 -5~99의 수, 문자열, null, undefined, 또는 이런 값의 배열(빈 칸 포함)이다.',
    ...one((r) => pick(r, DISPLAY_VALUES(r)), isDisplay),
  },
  // 배열
  {
    fn: 'chunk',
    name: 'pages',
    params: 'items: number[], size: number',
    returns: 'number[][]',
    body: 'return chunk(items, size);',
    doc: `items: ${T_INTS} size는 0~5의 정수다.`,
    make: (r) => [ints(r), int(r, 0, 5)],
    check: (a) => a.length === 2 && isInts(a[0]) && isInt(a[1], 0, 5),
  },
  {
    fn: 'uniqBy',
    name: 'dedupeByFloor',
    params: 'values: number[]',
    returns: 'number[]',
    body: 'return uniqBy(values, Math.floor);',
    doc: T_NUMS,
    ...one(nums, isNums),
  },
  {
    fn: 'difference',
    name: 'removeSeen',
    params: 'values: number[], seen: number[]',
    returns: 'number[]',
    body: 'return difference(values, seen);',
    doc: `두 인자 모두 ${T_NUMS}`,
    make: (r) => [nums(r), nums(r)],
    check: (a) => a.length === 2 && isNums(a[0]) && isNums(a[1]),
  },
  {
    fn: 'intersectionBy',
    name: 'commonByFloor',
    params: 'a: number[], b: number[]',
    returns: 'number[]',
    body: 'return intersectionBy(a, b, Math.floor);',
    doc: `두 인자 모두 ${T_NUMS}`,
    make: (r) => [nums(r), nums(r)],
    check: (a) => a.length === 2 && isNums(a[0]) && isNums(a[1]),
  },
  {
    fn: 'without',
    name: 'dropZeros',
    params: 'values: number[]',
    returns: 'number[]',
    body: 'return without(values, 0);',
    doc: T_NUMS,
    ...one(nums, isNums),
  },
  {
    fn: 'zipObject',
    name: 'toRecord',
    params: 'keys: string[], values: number[]',
    returns: 'Record<string, number>',
    body: 'return zipObject(keys, values);',
    doc: `keys는 길이 0~5의 소문자 이름 배열이고 values는 ${T_INTS}`,
    make: (r) => [list(r, 0, 5, () => pick(r, NAMES)), ints(r)],
    check: (a) => a.length === 2 && isArr(a[0], 5, (k) => NAMES.includes(k)) && isInts(a[1]),
  },
  {
    fn: 'groupBy',
    name: 'byAge',
    params: 'rows: Row[]',
    returns: 'Record<string, Row[]>',
    body: "return groupBy(rows, 'age');",
    doc: T_ROWS,
    ...one(rows, isRows),
  },
  {
    fn: 'countBy',
    name: 'countNames',
    params: 'rows: Row[]',
    returns: 'Record<string, number>',
    body: "return countBy(rows, 'name');",
    doc: T_ROWS,
    ...one(rows, isRows),
  },
  {
    fn: 'keyBy',
    name: 'indexById',
    params: 'rows: Row[]',
    returns: 'Record<string, Row>',
    body: "return keyBy(rows, 'id');",
    doc: T_ROWS,
    ...one(rows, isRows),
  },
  {
    fn: 'orderBy',
    name: 'rank',
    params: 'rows: Row[]',
    returns: 'Row[]',
    body: "return orderBy(rows, ['score', 'id'], ['desc', 'asc']);",
    doc: T_ROWS,
    ...one(rows, isRows),
  },
  {
    fn: 'sortBy',
    name: 'byScore',
    params: 'rows: Row[]',
    returns: 'Row[]',
    body: "return sortBy(rows, ['score']);",
    doc: T_ROWS,
    ...one(rows, isRows),
  },
  {
    fn: 'maxBy',
    name: 'oldest',
    params: 'rows: Row[]',
    returns: 'Row | undefined',
    body: "return maxBy(rows, 'age');",
    doc: T_ROWS,
    ...one(rows, isRows),
  },
  {
    fn: 'minBy',
    name: 'lowest',
    params: 'rows: Row[]',
    returns: 'Row | undefined',
    body: "return minBy(rows, 'score');",
    doc: T_ROWS,
    ...one(rows, isRows),
  },
  {
    fn: 'meanBy',
    name: 'averageAge',
    params: 'rows: Row[]',
    returns: 'number',
    body: "return meanBy(rows, 'age');",
    doc: T_ROWS,
    ...one(rows, isRows),
  },
  {
    fn: 'sumBy',
    name: 'totalScore',
    params: 'rows: Row[]',
    returns: 'number',
    body: "return sumBy(rows, 'score');",
    doc: T_ROWS,
    ...one(rows, isRows),
  },
  {
    fn: 'partition',
    name: 'splitAdults',
    params: 'rows: Row[]',
    returns: '[Row[], Row[]]',
    body: "return partition(rows, 'age');",
    doc: T_ROWS,
    ...one(rows, isRows),
  },
  {
    fn: 'takeWhile',
    name: 'leadingPositives',
    params: 'values: number[]',
    returns: 'number[]',
    body: 'return takeWhile(values, (v) => v > 0);',
    doc: T_NUMS,
    ...one(nums, isNums),
  },
  {
    fn: 'dropWhile',
    name: 'skipNegatives',
    params: 'values: number[]',
    returns: 'number[]',
    body: 'return dropWhile(values, (v) => v < 0);',
    doc: T_NUMS,
    ...one(nums, isNums),
  },
  {
    fn: 'xorBy',
    name: 'changedByFloor',
    params: 'a: number[], b: number[]',
    returns: 'number[]',
    body: 'return xorBy(a, b, Math.floor);',
    doc: `두 인자 모두 ${T_NUMS}`,
    make: (r) => [nums(r), nums(r)],
    check: (a) => a.length === 2 && isNums(a[0]) && isNums(a[1]),
  },
  {
    fn: 'last',
    name: 'latest',
    params: 'values: number[] | null | undefined',
    returns: 'number | undefined',
    body: 'return last(values);',
    doc: `${T_NUMS} null이나 undefined일 수 있다.`,
    ...one(
      (r) => maybe(r, nums(r)),
      (x) => isMaybe(x, isNums),
    ),
  },
  {
    fn: 'flattenDeep',
    name: 'flatIds',
    params: 'tree: unknown[]',
    returns: 'unknown[]',
    body: 'return flattenDeep(tree);',
    doc: '깊이 3 이하로 중첩된 정수 배열이다(빈 배열 포함).',
    ...one(
      (r) =>
        list(r, 0, 4, () =>
          r() < 0.4
            ? list(r, 0, 3, () => (r() < 0.3 ? [int(r, 0, 9), [int(r, 0, 9)]] : int(r, 0, 9)))
            : int(r, 0, 9),
        ),
      (x) => isNested(x, 3),
    ),
  },
  {
    fn: 'unionBy',
    name: 'mergeByFloor',
    params: 'a: number[], b: number[]',
    returns: 'number[]',
    body: 'return unionBy(a, b, Math.floor);',
    doc: `두 인자 모두 ${T_NUMS}`,
    make: (r) => [nums(r), nums(r)],
    check: (a) => a.length === 2 && isNums(a[0]) && isNums(a[1]),
  },
  // 수
  {
    fn: 'round',
    name: 'toCents',
    params: 'value: number',
    returns: 'number',
    body: 'return round(value, 2);',
    doc: 'value는 -5~100의 금액(소수 셋째 자리까지, -0, NaN 포함)이다.',
    ...one((r) => pick(r, [num(r), Math.round(r() * 100000) / 1000, 1.005, 2.675]), isMoney),
  },
  {
    fn: 'clamp',
    name: 'limit',
    params: 'value: number',
    returns: 'number',
    body: 'return clamp(value, 0, 50);',
    doc: 'value는 -5~99의 수(소수, -0, NaN 포함)다.',
    ...one(num, isNum),
  },
  {
    fn: 'inRange',
    name: 'isWorkingAge',
    params: 'age: number',
    returns: 'boolean',
    body: 'return inRange(age, 18, 65);',
    doc: 'age는 -5~99의 수(소수, -0, NaN 포함)다.',
    ...one(num, isNum),
  },
  {
    fn: 'sum',
    name: 'total',
    params: 'values: number[]',
    returns: 'number',
    body: 'return sum(values);',
    doc: T_NUMS,
    ...one(nums, isNums),
  },
  {
    fn: 'toNumber',
    name: 'parseAmount',
    params: 'text: string',
    returns: 'number',
    body: 'return toNumber(text);',
    doc: '길이 0~8의 문자열이고 숫자, 소수점, 부호, 공백, 영문자 e와 x로 이루어진다.',
    ...one(
      (r) => {
        let s = '';
        const n = int(r, 0, 8);
        for (let i = 0; i < n; i++) s += pick(r, [...'0123456789.-+ ex']);
        return s;
      },
      (x) => isStr(x, 8),
    ),
  },
  // 객체
  {
    fn: 'pick',
    name: 'publicFields',
    params: 'config: Config, key: string | string[]',
    returns: 'Config',
    body: 'return pick(config, key);',
    doc: `config: ${T_OBJ} key는 설정 키나 점 경로, 또는 그 배열이다.`,
    make: (r) => [obj(r, 2), path(r)],
    check: (a) => a.length === 2 && isObj(a[0], 2) && isPath(a[1]),
  },
  {
    fn: 'omit',
    name: 'withoutField',
    params: 'config: Config, key: string | string[]',
    returns: 'Config',
    body: 'return omit(config, key);',
    doc: `config: ${T_OBJ} key는 설정 키나 점 경로, 또는 그 배열이다.`,
    make: (r) => [obj(r, 2), path(r)],
    check: (a) => a.length === 2 && isObj(a[0], 2) && isPath(a[1]),
  },
  {
    fn: 'pickBy',
    name: 'definedFields',
    params: 'config: Config',
    returns: 'Config',
    body: 'return pickBy(config, (v) => v != null);',
    doc: T_OBJ,
    ...one(
      (r) => obj(r, 2),
      (x) => isObj(x, 2),
    ),
  },
  {
    fn: 'mapValues',
    name: 'flagsOf',
    params: 'config: Config',
    returns: 'Record<string, boolean>',
    body: 'return mapValues(config, Boolean);',
    doc: T_OBJ,
    ...one(
      (r) => obj(r, 2),
      (x) => isObj(x, 2),
    ),
  },
  {
    fn: 'merge',
    name: 'applyPatch',
    params: 'base: Config, patch: Config',
    returns: 'Config',
    body: 'return merge({}, base, patch);',
    doc: `두 인자 모두 ${T_OBJ}`,
    make: (r) => [obj(r, 2), obj(r, 2)],
    check: (a) => a.length === 2 && isObj(a[0], 2) && isObj(a[1], 2),
  },
  {
    fn: 'cloneDeep',
    name: 'snapshot',
    params: 'config: Config',
    returns: 'Config',
    body: 'return cloneDeep(config);',
    doc: T_OBJ,
    ...one(
      (r) => obj(r, 2),
      (x) => isObj(x, 2),
    ),
  },
  {
    fn: 'isEqual',
    name: 'sameConfig',
    params: 'a: Config, b: Config',
    returns: 'boolean',
    body: 'return isEqual(a, b);',
    doc: `두 인자 모두 ${T_OBJ}`,
    make: (r) => {
      const a = obj(r, 2);
      return [a, r() < 0.5 ? structuredClone(a) : obj(r, 2)];
    },
    check: (a) => a.length === 2 && isObj(a[0], 2) && isObj(a[1], 2),
  },
  {
    fn: 'isEmpty',
    name: 'isBlank',
    params: 'value: unknown',
    returns: 'boolean',
    body: 'return isEmpty(value);',
    doc: '값은 문자열, 수, 불리언, null, undefined, 배열, 설정 객체 가운데 하나다.',
    ...one(
      (r) => pick(r, ['', 'x', 0, 7, true, null, undefined, [], [1], {}, obj(r, 1)]),
      isBlankInput,
    ),
  },
  {
    fn: 'has',
    name: 'hasSetting',
    params: 'config: Config, key: string | string[]',
    returns: 'boolean',
    body: 'return has(config, key);',
    doc: `config: ${T_OBJ} key는 설정 키나 점 경로, 또는 그 배열이다.`,
    make: (r) => [obj(r, 2), path(r)],
    check: (a) => a.length === 2 && isObj(a[0], 2) && isPath(a[1]),
  },
  {
    fn: 'get',
    name: 'readSetting',
    params: 'config: Config, key: string | string[]',
    returns: 'unknown',
    body: "return get(config, key, 'default');",
    doc: `config: ${T_OBJ} key는 설정 키나 점 경로, 또는 그 배열이다.`,
    make: (r) => [obj(r, 2), path(r)],
    check: (a) => a.length === 2 && isObj(a[0], 2) && isPath(a[1]),
  },
  {
    fn: 'size',
    name: 'countOf',
    params: 'value: string | unknown[] | Config',
    returns: 'number',
    body: 'return size(value);',
    doc: '값은 사용자 입력 문자열(이모지 포함), 배열, 설정 객체 가운데 하나다.',
    ...one(
      (r) => pick(r, [text(r, 12), ints(r), obj(r, 1)]),
      (x) => isText(x, 12) || isInts(x) || isObj(x, 1),
    ),
  },
  {
    fn: 'values',
    name: 'settingValues',
    params: 'config: Config',
    returns: 'unknown[]',
    body: 'return values(config);',
    doc: T_OBJ,
    ...one(
      (r) => obj(r, 2),
      (x) => isObj(x, 2),
    ),
  },
  // 컬렉션(compat 전용 후보)
  {
    fn: 'includes',
    name: 'mentions',
    params: 'text: string, term: string',
    returns: 'boolean',
    body: 'return includes(text, term);',
    doc: `text: ${T_TEXT(30)} term은 길이 0~3의 문자열이다.`,
    make: (r) => [text(r, 30), text(r, 3)],
    check: (a) => a.length === 2 && isText(a[0], 30) && isText(a[1], 3),
  },
  {
    fn: 'find',
    name: 'firstAdult',
    params: 'rows: Row[]',
    returns: 'Row | undefined',
    body: "return find(rows, 'age');",
    doc: T_ROWS,
    ...one(rows, isRows),
  },
  {
    fn: 'map',
    name: 'namesOf',
    params: 'rows: Row[] | null',
    returns: 'string[]',
    body: "return map(rows, 'name');",
    doc: `${T_ROWS} null일 수 있다.`,
    ...one(
      (r) => maybe(r, rows(r)) ?? null,
      (x) => x === null || isRows(x),
    ),
  },
  {
    fn: 'every',
    name: 'allScored',
    params: 'rows: Row[]',
    returns: 'boolean',
    body: "return every(rows, 'score');",
    doc: T_ROWS,
    ...one(rows, isRows),
  },
  {
    fn: 'some',
    name: 'anyMissingAge',
    params: 'rows: Row[]',
    returns: 'boolean',
    body: 'return some(rows, { age: null });',
    doc: T_ROWS,
    ...one(rows, isRows),
  },
  {
    fn: 'reduce',
    name: 'sumScores',
    params: 'rows: Row[]',
    returns: 'number',
    body: 'return reduce(rows, (acc, r) => acc + r.score, 0);',
    doc: T_ROWS,
    ...one(rows, isRows),
  },
  {
    fn: 'indexOf',
    name: 'positionOf',
    params: 'values: number[], target: number',
    returns: 'number',
    body: 'return indexOf(values, target);',
    doc: `values: ${T_NUMS} target도 같은 범위의 수다.`,
    make: (r) => [nums(r), num(r)],
    check: (a) => a.length === 2 && isNums(a[0]) && isNum(a[1]),
  },
  {
    fn: 'nth',
    name: 'fromEnd',
    params: 'values: number[], n: number',
    returns: 'number | undefined',
    body: 'return nth(values, -n);',
    doc: `values: ${T_NUMS} n은 0~5의 정수다.`,
    make: (r) => [nums(r), int(r, 0, 5)],
    check: (a) => a.length === 2 && isNums(a[0]) && isInt(a[1], 0, 5),
  },
  {
    fn: 'toArray',
    name: 'listOf',
    params: 'value: unknown',
    returns: 'unknown[]',
    body: 'return toArray(value);',
    doc: '값은 문자열(이모지 포함), 배열, Set, 설정 객체, null 가운데 하나다.',
    ...one(
      (r) => pick(r, [text(r, 8), ints(r), new Set(ints(r)), obj(r, 1), null]),
      () => true,
    ),
  },
  {
    fn: 'lastIndexOf',
    name: 'lastPositionOf',
    params: 'values: number[], target: number',
    returns: 'number',
    body: 'return lastIndexOf(values, target);',
    doc: `values: ${T_NUMS} target도 같은 범위의 수다.`,
    make: (r) => [nums(r), num(r)],
    check: (a) => a.length === 2 && isNums(a[0]) && isNum(a[1]),
  },
  // 추가 후보: 실무에서 흔한 사용 방식
  {
    fn: 'uniq',
    name: 'distinctNames',
    params: 'names: string[]',
    returns: 'string[]',
    body: 'return uniq(names);',
    doc: T_NAMES,
    ...one(names, isNames),
  },
  {
    fn: 'compact',
    name: 'presentOnly',
    params: 'values: unknown[]',
    returns: 'unknown[]',
    body: 'return compact(values);',
    doc: '길이 0~10의 배열이고 원소는 0, 1, 7, 빈 문자열, "x", null, undefined, 불리언, NaN 가운데 하나다.',
    ...one(mixed, isMixed),
  },
  {
    fn: 'head',
    name: 'firstName',
    params: 'names: string[]',
    returns: 'string | undefined',
    body: 'return head(names);',
    doc: T_NAMES,
    ...one(names, isNames),
  },
  {
    fn: 'intersection',
    name: 'commonIds',
    params: 'a: number[], b: number[]',
    returns: 'number[]',
    body: 'return intersection(a, b);',
    doc: `두 인자 모두 ${T_INTS}`,
    make: (r) => [ints(r), ints(r)],
    check: (a) => a.length === 2 && isInts(a[0]) && isInts(a[1]),
  },
  {
    fn: 'union',
    name: 'allIds',
    params: 'a: number[], b: number[]',
    returns: 'number[]',
    body: 'return union(a, b);',
    doc: `두 인자 모두 ${T_INTS}`,
    make: (r) => [ints(r), ints(r)],
    check: (a) => a.length === 2 && isInts(a[0]) && isInts(a[1]),
  },
  {
    fn: 'flatten',
    name: 'joinPages',
    params: 'pages: number[][]',
    returns: 'number[]',
    body: 'return flatten(pages);',
    doc: `길이 0~4의 배열이고 원소는 ${T_INTS}`,
    ...one(
      (r) => list(r, 0, 4, () => ints(r)),
      (x) => isArr(x, 4, isInts),
    ),
  },
  {
    fn: 'fromPairs',
    name: 'toScores',
    params: 'entries: [string, number][]',
    returns: 'Record<string, number>',
    body: 'return fromPairs(entries);',
    doc: '길이 0~6의 [소문자 이름, -5~99 정수] 쌍 배열이다(이름 중복 가능).',
    ...one(pairs, isPairs),
  },
  {
    fn: 'invert',
    name: 'byValue',
    params: 'map: Record<string, string>',
    returns: 'Record<string, string>',
    body: 'return invert(map);',
    doc: '키와 값이 모두 소문자 이름인 객체다(값 중복 가능, 키 0~5개).',
    ...one(
      (r) => {
        const o = {};
        const n = int(r, 0, 5);
        for (let i = 0; i < n; i++) o[pick(r, NAMES)] = pick(r, NAMES);
        return o;
      },
      (x) =>
        isPlain(x) &&
        Object.keys(x).every((k) => NAMES.includes(k)) &&
        Object.values(x).every((v) => NAMES.includes(v)),
    ),
  },
  {
    fn: 'sortedUniq',
    name: 'distinctSorted',
    params: 'values: number[]',
    returns: 'number[]',
    body: 'return sortedUniq(values);',
    doc: '오름차순으로 정렬된 길이 0~12의 정수 배열이다(값 -5~20, 중복 가능).',
    ...one(
      (r) => ints(r).sort((a, b) => a - b),
      (x) => isInts(x) && x.every((v, i) => i === 0 || x[i - 1] <= v),
    ),
  },
  {
    fn: 'range',
    name: 'slots',
    params: 'count: number',
    returns: 'number[]',
    body: 'return range(count);',
    doc: 'count는 0~20의 정수다.',
    ...one(
      (r) => int(r, 0, 20),
      (x) => isInt(x, 0, 20),
    ),
  },
  {
    fn: 'times',
    name: 'emptyRows',
    params: 'count: number',
    returns: 'string[]',
    body: "return times(count, () => '');",
    doc: 'count는 0~20의 정수다.',
    ...one(
      (r) => int(r, 0, 20),
      (x) => isInt(x, 0, 20),
    ),
  },
  {
    fn: 'isNil',
    name: 'isMissing',
    params: 'value: unknown',
    returns: 'boolean',
    body: 'return isNil(value);',
    doc: '값은 0, 1, 7, 빈 문자열, "x", null, undefined, 불리언, NaN 가운데 하나다.',
    ...one(
      (r) => pick(r, [0, 1, 7, '', 'x', null, undefined, false, true, NaN]),
      (x) => [0, 1, 7, '', 'x', null, undefined, false, true].includes(x) || Number.isNaN(x),
    ),
  },
  {
    fn: 'isPlainObject',
    name: 'isConfigObject',
    params: 'value: unknown',
    returns: 'boolean',
    body: 'return isPlainObject(value);',
    doc: '값은 설정 객체, 배열, Date, null, 문자열, Object.create(null)로 만든 객체 가운데 하나다.',
    ...one(
      (r) => pick(r, [obj(r, 1), ints(r), new Date(0), null, 'x', Object.create(null)]),
      (x) =>
        isObj(x, 1) ||
        isInts(x) ||
        (x instanceof Date && x.getTime() === 0) ||
        x === null ||
        x === 'x' ||
        (typeof x === 'object' &&
          x !== null &&
          Object.getPrototypeOf(x) === null &&
          Object.keys(x).length === 0),
    ),
  },
  {
    fn: 'kebabCase',
    name: 'toCssName',
    params: 'key: string',
    returns: 'string',
    body: 'return kebabCase(key);',
    doc: '영문 소문자와 대문자로만 이루어진 camelCase 속성 이름이다(길이 0~20).',
    ...one(
      (r) => {
        let s = '';
        const n = int(r, 0, 4);
        for (let i = 0; i < n; i++)
          s += pick(r, ['font', 'Size', 'max', 'Width', 'line', 'Height', 'background', 'Color']);
        return s;
      },
      (x) => typeof x === 'string' && /^[a-zA-Z]{0,40}$/.test(x),
    ),
  },
  {
    fn: 'sumBy',
    name: 'totalQty',
    params: 'lines: { qty: number }[]',
    returns: 'number',
    body: 'return sumBy(lines, (l) => l.qty);',
    doc: '길이 0~10의 배열이고 원소는 { qty: 0~20 정수 }다.',
    ...one(
      (r) => list(r, 0, 10, () => ({ qty: int(r, 0, 20) })),
      (x) => isArr(x, 10, (l) => isPlain(l) && Object.keys(l).length === 1 && isInt(l.qty, 0, 20)),
    ),
  },
  {
    fn: 'isMatch',
    name: 'matchesFilter',
    params: 'row: Row, filter: Partial<Row>',
    returns: 'boolean',
    body: 'return isMatch(row, filter);',
    doc: 'row는 rows의 원소 형태이고 filter는 그 필드 일부를 가진 객체다.',
    make: (r) => {
      const x = row(r);
      const f = {};
      for (const k of Object.keys(x)) if (r() < 0.4) f[k] = r() < 0.5 ? x[k] : row(r)[k];
      return [x, f];
    },
    check: (a) =>
      a.length === 2 &&
      isRow(a[0]) &&
      isPlain(a[1]) &&
      Object.entries(a[1]).every(([k, v]) => isRow({ ...row(() => 0), [k]: v }) && k in a[0]),
  },
];
