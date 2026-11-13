/**
 * 과제 단위 대응 비교.
 *
 * 분석 단위는 실행이 아니라 과제다. 같은 과제를 반복 실행한 결과는 서로 독립이 아니므로
 * 과제별 평균을 먼저 낸 뒤 과제별 차이에 검정을 적용한다 (Miller, arXiv:2411.00640).
 */

/** 전수 열거를 쓰는 과제 수 상한. 2^20 = 약 105만 조합. */
const EXACT_LIMIT = 20;
const MONTE_CARLO_SAMPLES = 200_000;
/** 부동소수 오차로 관측값 자신이 "관측값 이상"에서 빠지는 것을 막는 허용치. */
const EPSILON = 1e-12;

export type Tail = 'two-sided' | 'greater' | 'less';

export function mean(values: readonly number[]): number {
  if (values.length === 0) {
    throw new RangeError('빈 배열의 평균은 정의되지 않는다');
  }
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/**
 * 과제별 차이 d[i] = 처리 arm의 통과 비율 − 대조 arm의 통과 비율.
 * 입력은 과제마다 실행별 점수 배열이다.
 */
export function taskDifferences(
  treatment: readonly (readonly number[])[],
  control: readonly (readonly number[])[],
): number[] {
  if (treatment.length !== control.length) {
    throw new RangeError('두 arm의 과제 수가 다르다');
  }
  return treatment.map((runs, i) => {
    const ctrl = control[i];
    if (ctrl === undefined) throw new RangeError('대조 arm에 해당 과제가 없다');
    return mean(runs) - mean(ctrl);
  });
}

/** 시드를 받는 난수 생성기 (mulberry32). 결과를 재현하려고 Math.random을 쓰지 않는다. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isExtreme(stat: number, observed: number, tail: Tail): boolean {
  switch (tail) {
    case 'two-sided':
      return Math.abs(stat) >= Math.abs(observed) - EPSILON;
    case 'greater':
      return stat >= observed - EPSILON;
    case 'less':
      return stat <= observed + EPSILON;
  }
}

/**
 * 부호 뒤집기 정확 검정.
 *
 * 귀무가설은 "처리가 어떤 과제에도 효과가 없다"이고, 그 아래에서는 과제 안의 arm 표지를
 * 바꿔도 분포가 같다. 과제별 차이의 부호를 모든 조합으로 뒤집어 합이 관측값만큼 극단적인
 * 조합의 비율을 p값으로 삼는다. 과제가 EXACT_LIMIT개를 넘으면 시드 고정 표집으로 근사한다.
 */
export function signFlipPValue(
  differences: readonly number[],
  tail: Tail = 'two-sided',
  seed = 1,
): number {
  const n = differences.length;
  if (n === 0) throw new RangeError('과제가 하나도 없다');
  let observed = 0;
  for (const d of differences) observed += d;

  if (n <= EXACT_LIMIT) {
    const total = 2 ** n;
    let extreme = 0;
    for (let mask = 0; mask < total; mask++) {
      let stat = 0;
      for (let i = 0; i < n; i++) {
        const d = differences[i] ?? 0;
        stat += (mask >>> i) & 1 ? -d : d;
      }
      if (isExtreme(stat, observed, tail)) extreme++;
    }
    return extreme / total;
  }

  const random = mulberry32(seed);
  let extreme = 1; // 관측값 자신을 포함해 p값이 0이 되지 않게 한다
  for (let s = 0; s < MONTE_CARLO_SAMPLES; s++) {
    let stat = 0;
    for (const d of differences) stat += random() < 0.5 ? -d : d;
    if (isExtreme(stat, observed, tail)) extreme++;
  }
  return extreme / (MONTE_CARLO_SAMPLES + 1);
}

/**
 * 동등성 검정 (두 단측 검정).
 * 평균 차이가 −δ보다 크다는 검정과 +δ보다 작다는 검정의 p값 중 큰 쪽을 돌려준다.
 * 이 값이 유의수준보다 작으면 두 단측 검정이 모두 유의하다.
 * 차이를 δ만큼 옮긴 값이 0을 중심으로 대칭이라는 가정(상수 효과)에 의존한다.
 */
export function equivalencePValue(differences: readonly number[], delta: number, seed = 1): number {
  if (!(delta > 0)) throw new RangeError('δ는 양수여야 한다');
  const lower = signFlipPValue(
    differences.map((d) => d + delta),
    'greater',
    seed,
  );
  const upper = signFlipPValue(
    differences.map((d) => d - delta),
    'less',
    seed,
  );
  return Math.max(lower, upper);
}

/** Holm 보정. 입력 순서대로 기각 여부를 돌려준다. */
export function holm(pValues: readonly number[], alpha: number): boolean[] {
  const order = pValues.map((p, index) => ({ p, index })).sort((a, b) => a.p - b.p);
  const rejected = new Array<boolean>(pValues.length).fill(false);
  for (let rank = 0; rank < order.length; rank++) {
    const item = order[rank];
    if (item === undefined) break;
    if (item.p > alpha / (order.length - rank)) break;
    rejected[item.index] = true;
  }
  return rejected;
}

/**
 * 양측 부호 뒤집기 검정이 유의수준 alpha 아래로 내려갈 수 있는 최소 과제 수.
 * 0이 아닌 차이가 m개이고 전부 같은 방향일 때 가능한 최소 p값은 2 / 2^m이다.
 */
export function minNonzeroForAlpha(alpha: number): number {
  if (!(alpha > 0 && alpha < 1)) throw new RangeError('alpha는 0과 1 사이여야 한다');
  let m = 1;
  while (2 / 2 ** m >= alpha) m++;
  return m;
}
