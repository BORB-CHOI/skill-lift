/**
 * migrate 과제가 함께 쓰는 입력 생성기.
 *
 * 생성기 하나가 입력 범위 하나를 정의한다. describe는 그 범위를 과제 문장에 적을 글이고,
 * make는 0 이상 1 미만의 난수 함수를 받아 인자 배열 하나를 만든다. 과제 문장의 범위 설명과
 * 채점 입력이 같은 정의에서 나오므로 둘이 어긋나지 않는다.
 */

const pick = (random, items) => items[Math.floor(random() * items.length)];
const int = (random, min, max) => min + Math.floor(random() * (max - min + 1));
const list = (random, min, max, make) => Array.from({ length: int(random, min, max) }, make);

const NAMES = ['kim', 'lee', 'park', 'choi', 'jung'];
const KEYS = ['theme', 'layout', 'accent', 'size', 'items', 'enabled', 'label', 'limits'];
const WORDS = ['font', 'size', 'max', 'width', 'line', 'height', 'user', 'id', 'api', 'url'];

function row(random) {
  return { id: int(random, 0, 9), name: pick(random, NAMES), age: int(random, 18, 60) };
}

function scalar(random) {
  const kind = int(random, 0, 3);
  if (kind === 0) return pick(random, ['red', 'blue', 'compact', '']);
  if (kind === 1) return int(random, -5, 99);
  if (kind === 2) return random() < 0.5;
  return null;
}

function jsonValue(random, depth) {
  const kind = depth <= 0 ? 0 : int(random, 0, 3);
  if (kind <= 1) return scalar(random);
  if (kind === 2) {
    const ofObjects = depth > 1 && random() < 0.4;
    return list(random, 0, 3, () => (ofObjects ? jsonObject(random, depth - 1) : scalar(random)));
  }
  return jsonObject(random, depth - 1);
}

function jsonObject(random, depth) {
  const out = {};
  const count = int(random, 0, 3);
  for (let i = 0; i < count; i++) out[pick(random, KEYS)] = jsonValue(random, depth);
  return out;
}

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/** 원본과 같은 자리에 같은 종류의 값만 덮어쓰는 패치. */
function patchFor(random, base, depth) {
  const out = {};
  for (const [key, current] of Object.entries(base)) {
    if (random() < 0.4) continue;
    if (Array.isArray(current)) {
      const ofObjects = current.some(isObject);
      out[key] = Array.from({ length: int(random, 0, 3) }, (_unused, i) => {
        if (!ofObjects) return scalar(random);
        return isObject(current[i])
          ? patchFor(random, current[i], depth - 1)
          : jsonObject(random, Math.max(0, depth - 1));
      });
    } else if (isObject(current)) {
      out[key] = patchFor(random, current, depth - 1);
    } else {
      out[key] = scalar(random);
    }
  }
  if (random() < 0.5) {
    const fresh = pick(random, KEYS);
    if (!(fresh in base)) out[fresh] = jsonValue(random, Math.max(0, depth - 1));
  }
  return out;
}

function word(random) {
  const base = pick(random, WORDS);
  const style = int(random, 0, 3);
  if (style === 0) return base;
  if (style === 1) return base.toUpperCase();
  if (style === 2) return base[0].toUpperCase() + base.slice(1);
  return String(int(random, 0, 99));
}

function label(random) {
  let text = '';
  const count = int(random, 0, 5);
  for (let i = 0; i < count; i++) text += word(random) + pick(random, ['', '', ' ', '-', '_', '.']);
  return text.slice(0, 40);
}

export const ranges = {
  rows: {
    describe:
      '길이 0~12의 배열이고 각 원소는 { id: 0~9의 정수, name: 다섯 가지 소문자 이름 중 하나, age: 18~60의 정수 }',
    make: (random) => [list(random, 0, 12, () => row(random))],
  },
  row: {
    describe: '{ id: 0~9의 정수, name: 다섯 가지 소문자 이름 중 하나, age: 18~60의 정수 }',
    make: (random) => [row(random)],
  },
  configPair: {
    describe:
      'base는 깊이 3 이하의 JSON 객체이고 값은 문자열, 숫자, 불리언, null, 배열, 객체다. 배열의 원소는 전부 스칼라이거나 전부 객체다. patch는 base와 같은 자리에 같은 종류의 값만 덮어쓴다(객체 자리에는 객체, 배열 자리에는 배열, 그 외에는 문자열·숫자·불리언·null). base에 없는 키는 어떤 값이든 추가할 수 있다',
    make: (random) => {
      const base = jsonObject(random, 3);
      return [base, patchFor(random, base, 3)];
    },
  },
  label: {
    describe:
      '길이 0~40의 문자열이고 ASCII 영문자, 숫자, 공백, 하이픈, 밑줄, 마침표로 이루어진다. 대문자가 연속되거나 숫자가 글자 사이에 올 수 있다',
    make: (random) => [label(random)],
  },
  asciiText: {
    describe: '길이 0~200의 출력 가능한 ASCII 문자열(코드 0x20~0x7E)',
    make: (random) => {
      let text = '';
      const length = int(random, 0, 200);
      for (let i = 0; i < length; i++) text += String.fromCharCode(int(random, 0x20, 0x7e));
      return [text];
    },
  },
  scores: {
    describe: '키가 소문자 이름이고 값이 -5~99의 정수인 객체. 키는 0~5개',
    make: (random) => {
      const out = {};
      const count = int(random, 0, 5);
      for (let i = 0; i < count; i++) out[pick(random, NAMES)] = int(random, -5, 99);
      return [out];
    },
  },
  jsonAny: {
    describe:
      'JSON 값 하나. null, 불리언, -5~99의 정수, 문자열, 깊이 2 이하의 배열이나 객체(빈 것 포함)',
    make: (random) => [jsonValue(random, 2)],
  },
  amountText: {
    describe:
      '길이 0~8의 문자열이고 숫자, 소수점, 부호, 공백, 영문자 e와 x로 이루어진다. 숫자로 읽히지 않는 문자열도 포함한다',
    make: (random) => {
      let text = '';
      const length = int(random, 0, 8);
      for (let i = 0; i < length; i++)
        text += pick(random, [...'0123456789', '.', '-', '+', ' ', 'e', 'x']);
      return [text];
    },
  },
  pairs: {
    describe: '길이 0~8의 [문자열, 정수] 쌍 배열. 문자열은 소문자 이름이고 겹칠 수 있다',
    make: (random) => [list(random, 0, 8, () => [pick(random, NAMES), int(random, -5, 99)])],
  },
  sortedInts: {
    describe: '오름차순으로 정렬된 길이 0~20의 정수 배열. 값은 -5~20이고 겹칠 수 있다',
    make: (random) => [list(random, 0, 20, () => int(random, -5, 20)).sort((a, b) => a - b)],
  },
};
