/**
 * 두 표본 순열 검정 (평균 차이).
 *
 * 귀무가설 아래에서는 실행에 붙은 조건 표지를 바꿔도 분포가 같다. 처리 표본 크기 n1만큼을 합친
 * 표본에서 고르는 모든 배치(C(n1 + n2, n1)가지)에서 평균 차이를 계산해 관측값만큼 극단적인
 * 배치의 비율을 p값으로 삼는다.
 *
 * - 정확 계산: C(n1 + n2, n1) <= 200,000이면 모든 배치를 센다. 배치를 하나씩 나열하지 않고
 *   "처리 표본에서 r개, 대조 표본에서 n1 − r개를 고른 합"의 분포를 동적 계획법으로 누적한다.
 *   나열과 같은 수를 센다.
 * - 몬테카를로: 그보다 많으면 시드를 고정해 배치 200,000개를 뽑는다. p = (1 + 극단 수) / (뽑은 수 + 1).
 *
 * 처리 표본을 θ만큼 옮긴 검정(TOST, 구간 역산)은 분포를 다시 만들지 않는다. 배치마다 처리 표본에서
 * 고른 개수 r을 함께 저장해 두면, 옮긴 뒤 첫 그룹의 합은 (원래 합 + θ·r)이다.
 */
import type { Interval } from './intervals.js';
import { mean, mulberry32 } from './paired.js';

export const EXACT_LIMIT = 200_000;
export const MC_DRAWS = 200_000;

export type Tail = 'two-sided' | 'greater' | 'less';

export interface PermutationOptions {
  readonly seed?: number;
  /** 몬테카를로 표본 수. */
  readonly draws?: number;
  /** 정확 계산을 쓰는 배치 수 상한. */
  readonly exactLimit?: number;
}

/**
 * 순열 분포. 항목 i는 "첫 그룹(처리 표본 크기)에 원래 처리 실행이 r[i]개 들어가고, 옮기기 전
 * 첫 그룹 점수 합이 raw[i]인 배치"이고, 그런 배치 수가 weight[i]다. 몬테카를로는 weight가 모두 1이다.
 */
export interface PermutationDistribution {
  readonly method: 'exact' | 'monte-carlo';
  readonly nTreatment: number;
  readonly nControl: number;
  readonly sumTreatment: number;
  readonly sumControl: number;
  readonly r: Int32Array;
  readonly raw: Float64Array;
  readonly weight: Float64Array;
  /** 정확 계산이면 C(n1 + n2, n1), 몬테카를로면 뽑은 수. */
  readonly permutations: number;
}

/** 이항 계수. 2^53을 넘으면 근삿값이지만 상한 비교에만 쓴다. */
export function binomialCoefficient(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  const small = Math.min(k, n - k);
  let value = 1;
  for (let i = 1; i <= small; i++) value = (value * (n - small + i)) / i;
  return Math.round(value);
}

const sum = (values: readonly number[]): number => values.reduce((s, v) => s + v, 0);
/** 합이 1e-9 안에서 같으면 같은 값으로 본다. 극단 판정의 허용치와 같은 규모다. */
const keyOf = (value: number): number => Math.round(value * 1e9);

type SumTable = Map<number, { sum: number; count: number }>[];

/** k = 0..maxPick개를 고른 부분집합의 합 분포. */
function subsetSums(values: readonly number[], maxPick: number): SumTable {
  const table: SumTable = Array.from(
    { length: maxPick + 1 },
    () => new Map<number, { sum: number; count: number }>(),
  );
  table[0]?.set(0, { sum: 0, count: 1 });
  values.forEach((v, index) => {
    for (let k = Math.min(index + 1, maxPick); k >= 1; k--) {
      const from = table[k - 1];
      const to = table[k];
      if (from === undefined || to === undefined) continue;
      for (const entry of from.values()) {
        const s = entry.sum + v;
        const key = keyOf(s);
        const existing = to.get(key);
        if (existing === undefined) to.set(key, { sum: s, count: entry.count });
        else existing.count += entry.count;
      }
    }
  });
  return table;
}

function exactDistribution(
  treatment: readonly number[],
  control: readonly number[],
): PermutationDistribution {
  const n1 = treatment.length;
  const n2 = control.length;
  const t = subsetSums(treatment, n1);
  const c = subsetSums(control, Math.min(n1, n2));
  const r: number[] = [];
  const raw: number[] = [];
  const weight: number[] = [];
  for (let picked = Math.max(0, n1 - n2); picked <= n1; picked++) {
    const combined = new Map<number, { sum: number; count: number }>();
    for (const a of t[picked]?.values() ?? []) {
      for (const b of c[n1 - picked]?.values() ?? []) {
        const s = a.sum + b.sum;
        const key = keyOf(s);
        const existing = combined.get(key);
        if (existing === undefined) combined.set(key, { sum: s, count: a.count * b.count });
        else existing.count += a.count * b.count;
      }
    }
    for (const entry of combined.values()) {
      r.push(picked);
      raw.push(entry.sum);
      weight.push(entry.count);
    }
  }
  return {
    method: 'exact',
    nTreatment: n1,
    nControl: n2,
    sumTreatment: sum(treatment),
    sumControl: sum(control),
    r: Int32Array.from(r),
    raw: Float64Array.from(raw),
    weight: Float64Array.from(weight),
    permutations: binomialCoefficient(n1 + n2, n1),
  };
}

function monteCarloDistribution(
  treatment: readonly number[],
  control: readonly number[],
  seed: number,
  draws: number,
): PermutationDistribution {
  const n1 = treatment.length;
  const pooled = [...treatment, ...control];
  const n = pooled.length;
  const random = mulberry32(seed);
  const index = Int32Array.from({ length: n }, (_, i) => i);
  const r = new Int32Array(draws);
  const raw = new Float64Array(draws);
  for (let d = 0; d < draws; d++) {
    // 부분 Fisher–Yates: 앞쪽 n1칸이 첫 그룹이다.
    let picked = 0;
    let total = 0;
    for (let i = 0; i < n1; i++) {
      const j = i + Math.floor(random() * (n - i));
      const chosen = index[j] ?? 0;
      index[j] = index[i] ?? 0;
      index[i] = chosen;
      if (chosen < n1) picked++;
      total += pooled[chosen] ?? 0;
    }
    r[d] = picked;
    raw[d] = total;
  }
  return {
    method: 'monte-carlo',
    nTreatment: n1,
    nControl: control.length,
    sumTreatment: sum(treatment),
    sumControl: sum(control),
    r,
    raw,
    weight: new Float64Array(draws).fill(1),
    permutations: draws,
  };
}

/** 실행 점수로 순열 분포를 만든다. 배치 수가 상한 이하면 정확 계산, 넘으면 몬테카를로다. */
export function permutationDistribution(
  treatment: readonly number[],
  control: readonly number[],
  options: PermutationOptions = {},
): PermutationDistribution {
  if (treatment.length === 0 || control.length === 0) {
    throw new RangeError('두 표본 모두 실행이 1개 이상 있어야 한다');
  }
  const limit = options.exactLimit ?? EXACT_LIMIT;
  if (binomialCoefficient(treatment.length + control.length, treatment.length) <= limit) {
    return exactDistribution(treatment, control);
  }
  return monteCarloDistribution(treatment, control, options.seed ?? 1, options.draws ?? MC_DRAWS);
}

/**
 * 정수 부분집합 합 표. table[k][s] = 값 k개를 골라 합이 s인 경우의 수. 표 폭은 width.
 * 점수가 (통과 항목 수 / items)인 데이터에서 통과 수 배열로 만든다.
 */
export function integerSubsetCounts(
  values: readonly number[],
  maxPick: number,
  width: number,
): Float64Array[] {
  const table = Array.from({ length: maxPick + 1 }, () => new Float64Array(width));
  (table[0] as Float64Array)[0] = 1;
  let reach = 0;
  values.forEach((v, index) => {
    if (!Number.isInteger(v) || v < 0) throw new RangeError('통과 수는 0 이상의 정수여야 한다');
    reach = Math.min(width - 1, reach + v);
    for (let k = Math.min(index + 1, maxPick); k >= 1; k--) {
      const from = table[k - 1] as Float64Array;
      const to = table[k] as Float64Array;
      for (let s = reach - v; s >= 0; s--) {
        const w = from[s] ?? 0;
        if (w !== 0) to[s + v] = (to[s + v] ?? 0) + w;
      }
    }
  });
  return table;
}

/**
 * 점수가 (통과 항목 수 / items)인 데이터의 정확 순열 검정 표. 배치 수와 무관하게 정확 계산한다.
 * 검출력 시뮬레이션처럼 p값을 수십만 번 부르는 곳에 쓴다. 배치를 합치지 않고 처리 쪽 표와
 * 대조 쪽 누적 표만 두어, p값 하나를 O(n1 × 폭)에 센다.
 */
export interface GridTables {
  readonly n1: number;
  readonly n2: number;
  readonly items: number;
  readonly sumTreatment: number;
  readonly sumControl: number;
  /** 처리 쪽 부분집합 합 표. */
  readonly treatment: readonly Float64Array[];
  /** 대조 쪽 q개 부분집합에서 합이 s 이상인 경우의 수 (꼬리 누적). */
  readonly controlTail: readonly Float64Array[];
  readonly permutations: number;
}

/** @param treatmentTable 같은 처리 표본을 여러 대조와 비교할 때 미리 만든 표를 넘긴다. */
export function gridTables(
  treatment: readonly number[],
  control: readonly number[],
  items: number,
  treatmentTable?: readonly Float64Array[],
): GridTables {
  const n1 = treatment.length;
  const n2 = control.length;
  if (n1 === 0 || n2 === 0) throw new RangeError('두 표본 모두 실행이 1개 이상 있어야 한다');
  const width = n1 * items + 1;
  const t = treatmentTable ?? integerSubsetCounts(treatment, n1, width);
  const controlTail = integerSubsetCounts(control, Math.min(n1, n2), width).map((row) => {
    const tail = new Float64Array(width + 1);
    for (let s = width - 1; s >= 0; s--) tail[s] = (tail[s + 1] ?? 0) + (row[s] ?? 0);
    return tail;
  });
  return {
    n1,
    n2,
    items,
    sumTreatment: sum(treatment),
    sumControl: sum(control),
    treatment: t,
    controlTail,
    permutations: binomialCoefficient(n1 + n2, n1),
  };
}

/** 정수 합 S(첫 그룹 통과 수 합)가 조건을 만족하는 배치 수. bound는 r마다의 정수 경계. */
function countGrid(
  tables: GridTables,
  bound: (picked: number) => number,
  direction: 'atLeast' | 'atMost',
): number {
  const { n1, n2, items } = tables;
  let count = 0;
  for (let picked = Math.max(0, n1 - n2); picked <= n1; picked++) {
    const t = tables.treatment[picked] as Float64Array;
    const tail = tables.controlTail[n1 - picked] as Float64Array;
    const all = tail[0] ?? 0;
    const limit = bound(picked);
    for (let st = Math.min(t.length - 1, picked * items); st >= 0; st--) {
      const w = t[st] ?? 0;
      if (w === 0) continue;
      const need = limit - st;
      if (direction === 'atLeast') {
        count += w * (need <= 0 ? all : need >= tail.length ? 0 : (tail[need] ?? 0));
      } else {
        const above = need + 1 <= 0 ? all : need + 1 >= tail.length ? 0 : (tail[need + 1] ?? 0);
        count += w * (all - above);
      }
    }
  }
  return count;
}

/** tailPValue와 같은 정의를 정수 표로 계산한다. shift는 점수 척도(0..1)다. */
export function gridTailPValue(tables: GridTables, shift: number, tail: Tail): number {
  const { n1, n2, items } = tables;
  const tol = 1e-6;
  // 점수 척도의 첫 그룹 합 g = S/items + shift·r. S는 정수다.
  const observed = tables.sumTreatment / items + shift * n1;
  const total = observed + tables.sumControl / items;
  const center = (total * n1) / (n1 + n2);
  const atLeast = (g: number): number =>
    countGrid(tables, (r) => Math.ceil(items * (g - shift * r) - tol), 'atLeast');
  const atMost = (g: number): number =>
    countGrid(tables, (r) => Math.floor(items * (g - shift * r) + tol), 'atMost');
  let extreme: number;
  if (tail === 'greater') extreme = atLeast(observed);
  else if (tail === 'less') extreme = atMost(observed);
  else {
    const reach = Math.abs(observed - center);
    if (reach * items < tol) return 1;
    extreme = atLeast(center + reach) + atMost(center - reach);
  }
  return extreme / tables.permutations;
}

/** 정수 표로 차이 검정과 TOST를 함께 낸다. */
export function gridTests(tables: GridTables, delta: number): PermutationTests {
  if (!(delta > 0)) throw new RangeError('δ는 양수여야 한다');
  return {
    method: 'exact',
    permutations: tables.permutations,
    meanDifference:
      (tables.sumTreatment / tables.n1 - tables.sumControl / tables.n2) / tables.items,
    pDifference: gridTailPValue(tables, 0, 'two-sided'),
    pEquivalence: Math.max(
      gridTailPValue(tables, delta, 'greater'),
      gridTailPValue(tables, -delta, 'less'),
    ),
  };
}

/**
 * 처리 표본을 shift만큼 옮긴 데이터의 p값.
 * 첫 그룹 합 g가 크면 평균 차이도 크다(차이 = (g − g0)(1/n1 + 1/n2), g0은 차이가 0인 합).
 * - greater: 차이 >= 관측 차이, less: 차이 <= 관측 차이, two-sided: |차이| >= |관측 차이|.
 */
export function tailPValue(dist: PermutationDistribution, shift: number, tail: Tail): number {
  const n1 = dist.nTreatment;
  const observed = dist.sumTreatment + shift * n1;
  const total = observed + dist.sumControl;
  const center = (total * n1) / (n1 + dist.nControl);
  const eps = 1e-9 * (1 + Math.abs(total));
  const reach = Math.abs(observed - center) - eps;
  let extreme = 0;
  let weightTotal = 0;
  for (let i = 0; i < dist.raw.length; i++) {
    const w = dist.weight[i] ?? 0;
    weightTotal += w;
    const g = (dist.raw[i] ?? 0) + shift * (dist.r[i] ?? 0);
    const hit =
      tail === 'greater'
        ? g >= observed - eps
        : tail === 'less'
          ? g <= observed + eps
          : Math.abs(g - center) >= reach;
    if (hit) extreme += w;
  }
  return dist.method === 'exact' ? extreme / weightTotal : (1 + extreme) / (weightTotal + 1);
}

/** TOST p값. +δ 쪽(차이 > −δ)과 −δ 쪽(차이 < δ) 단측 검정의 p값 중 큰 값이다. */
export function equivalencePValue(dist: PermutationDistribution, delta: number): number {
  if (!(delta > 0)) throw new RangeError('δ는 양수여야 한다');
  return Math.max(tailPValue(dist, delta, 'greater'), tailPValue(dist, -delta, 'less'));
}

export interface PermutationTests {
  readonly method: PermutationDistribution['method'];
  readonly permutations: number;
  readonly meanDifference: number;
  /** 양측 차이 검정 p값. */
  readonly pDifference: number;
  /** TOST p값. */
  readonly pEquivalence: number;
}

export function permutationTests(
  treatment: readonly number[],
  control: readonly number[],
  delta: number,
  options: PermutationOptions = {},
): PermutationTests {
  const dist = permutationDistribution(treatment, control, options);
  return testsFromDistribution(dist, delta);
}

export function testsFromDistribution(
  dist: PermutationDistribution,
  delta: number,
): PermutationTests {
  return {
    method: dist.method,
    permutations: dist.permutations,
    meanDifference: dist.sumTreatment / dist.nTreatment - dist.sumControl / dist.nControl,
    pDifference: tailPValue(dist, 0, 'two-sided'),
    pEquivalence: equivalencePValue(dist, delta),
  };
}

/**
 * 평균 차이의 (1 − α) 구간. {θ : 처리 표본을 −θ 옮긴 양측 검정의 p > α}의 양 끝을 이분법으로 찾는다.
 * p(θ)는 계단 함수라서 경계는 tolerance 안의 근삿값이다. 가능한 최소 p값이 α보다 크면 그쪽 경계는
 * ±Infinity다.
 */
export function permutationInterval(
  treatment: readonly number[],
  control: readonly number[],
  alpha = 0.05,
  options: PermutationOptions & { readonly tolerance?: number } = {},
): Interval {
  if (!(alpha > 0 && alpha < 1)) throw new RangeError('α는 0과 1 사이여야 한다');
  const dist = permutationDistribution(treatment, control, options);
  const tolerance = options.tolerance ?? 1e-4;
  const accepted = (theta: number): boolean => tailPValue(dist, -theta, 'two-sided') > alpha;
  const center = mean(treatment) - mean(control);
  const pooled = [...treatment, ...control];
  // 중심에서 2·범위 + 1만큼 떨어진 θ에서는 옮긴 처리 표본이 대조 표본과 겹치지 않아 관측 배치가
  // 가장 극단이 된다(|중심| <= 범위이므로).
  const span = 2 * (Math.max(...pooled) - Math.min(...pooled)) + 1;
  const bisect = (outside: number): number => {
    let inner = center;
    let outer = outside;
    while (Math.abs(outer - inner) > tolerance) {
      const middle = (inner + outer) / 2;
      if (accepted(middle)) inner = middle;
      else outer = middle;
    }
    return (inner + outer) / 2;
  };
  const low = center - span;
  const high = center + span;
  return {
    lower: accepted(low) ? -Infinity : bisect(low),
    upper: accepted(high) ? Infinity : bisect(high),
  };
}
