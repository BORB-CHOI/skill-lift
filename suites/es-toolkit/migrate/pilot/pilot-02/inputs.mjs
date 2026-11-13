/**
 * pilot-02의 입력 범위. 과제 문장의 범위 설명은 이 생성기가 만드는 입력을 글로 옮긴 것이다.
 * 각 생성기는 0 이상 1 미만의 난수를 돌려주는 함수를 받아 인자 배열 하나를 만든다.
 */

const pick = (random, items) => items[Math.floor(random() * items.length)];
const int = (random, min, max) => min + Math.floor(random() * (max - min + 1));

const KEYS = ['theme', 'layout', 'accent', 'size', 'items', 'enabled', 'label', 'limits'];
const WORDS = ['font', 'size', 'max', 'width', 'line', 'height', 'user', 'id', 'api', 'url'];

function scalar(random) {
  const kind = int(random, 0, 3);
  if (kind === 0) return pick(random, ['red', 'blue', 'compact', '']);
  if (kind === 1) return int(random, -5, 99);
  if (kind === 2) return random() < 0.5;
  return null;
}

/** 깊이 제한이 있는 JSON 값. 배열의 원소는 스칼라이거나 객체다. */
function value(random, depth) {
  const kind = depth <= 0 ? 0 : int(random, 0, 3);
  if (kind <= 1) return scalar(random);
  if (kind === 2) {
    const ofObjects = depth > 1 && random() < 0.4;
    return Array.from({ length: int(random, 0, 3) }, () =>
      ofObjects ? object(random, depth - 1) : scalar(random),
    );
  }
  return object(random, depth - 1);
}

function object(random, depth) {
  const out = {};
  const count = int(random, 0, 3);
  for (let i = 0; i < count; i++) out[pick(random, KEYS)] = value(random, depth);
  return out;
}

/** 원본과 같은 종류의 값만 덮어쓰는 패치. 객체 자리에는 객체, 배열 자리에는 배열, 그 외에는 스칼라. */
function patchFor(random, base, depth) {
  const out = {};
  for (const [key, current] of Object.entries(base)) {
    if (random() < 0.4) continue;
    if (Array.isArray(current)) {
      const ofObjects = current.some((item) => typeof item === 'object' && item !== null);
      // 배열 안의 객체도 같은 자리의 원본 객체와 종류를 맞춘다. 원본보다 긴 부분만 새 객체다.
      out[key] = Array.from({ length: int(random, 0, 3) }, (_unused, i) => {
        if (!ofObjects) return scalar(random);
        const target = current[i];
        return typeof target === 'object' && target !== null && !Array.isArray(target)
          ? patchFor(random, target, depth - 1)
          : object(random, Math.max(0, depth - 1));
      });
    } else if (typeof current === 'object' && current !== null) {
      out[key] = patchFor(random, current, depth - 1);
    } else {
      out[key] = scalar(random);
    }
  }
  // 원본에 없는 키는 어떤 값이든 올 수 있다.
  if (random() < 0.5) {
    const fresh = pick(random, KEYS);
    if (!(fresh in base)) out[fresh] = value(random, Math.max(0, depth - 1));
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

export const generators = {
  applyPatch(random) {
    const base = object(random, 3);
    return [base, patchFor(random, base, 3)];
  },
  toTitle(random) {
    let text = '';
    const count = int(random, 0, 5);
    for (let i = 0; i < count; i++) {
      text += word(random) + pick(random, ['', '', ' ', '-', '_', '.']);
    }
    return [text.slice(0, 40)];
  },
  preview(random) {
    const length = int(random, 0, 200);
    let text = '';
    // 출력 가능한 ASCII(0x20~0x7E).
    for (let i = 0; i < length; i++) text += String.fromCharCode(int(random, 0x20, 0x7e));
    return [text];
  },
};
