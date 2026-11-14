import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/stats/paired.js';
import {
  binomialCoefficient,
  gridTables,
  gridTailPValue,
  gridTests,
  permutationDistribution,
  permutationInterval,
  permutationTests,
  tailPValue,
  type Tail,
} from '../../src/stats/permutation.js';

/** 모든 배치를 하나씩 나열해 p값을 낸다. 비교 기준이다. */
function bruteForce(
  treatment: readonly number[],
  control: readonly number[],
  shift: number,
  tail: Tail,
): number {
  const shifted = treatment.map((v) => v + shift);
  const pooled = [...shifted, ...control];
  const n1 = treatment.length;
  const n2 = control.length;
  const meanOf = (xs: readonly number[]): number => xs.reduce((s, v) => s + v, 0) / xs.length;
  const observed = meanOf(shifted) - meanOf(control);
  let extreme = 0;
  let total = 0;
  const pick = (start: number, chosen: number[]): void => {
    if (chosen.length === n1) {
      const inGroup = new Set(chosen);
      const g1 = chosen.map((i) => pooled[i] ?? 0);
      const g2 = pooled.filter((_, i) => !inGroup.has(i));
      const d = meanOf(g1) - meanOf(g2);
      total++;
      const eps = 1e-9;
      if (
        tail === 'greater'
          ? d >= observed - eps
          : tail === 'less'
            ? d <= observed + eps
            : Math.abs(d) >= Math.abs(observed) - eps
      )
        extreme++;
      return;
    }
    for (let i = start; i <= n1 + n2 - (n1 - chosen.length); i++) pick(i + 1, [...chosen, i]);
  };
  pick(0, []);
  return extreme / total;
}

function randomPasses(n: number, items: number, seed: number): number[] {
  const random = mulberry32(seed);
  return Array.from({ length: n }, () => Math.floor(random() * (items + 1)));
}

describe('binomialCoefficient', () => {
  it('정확 계산 상한 근처 값이 맞다', () => {
    expect(binomialCoefficient(20, 10)).toBe(184_756);
    expect(binomialCoefficient(22, 11)).toBe(705_432);
    expect(binomialCoefficient(5, 7)).toBe(0);
  });
});

describe('정확 순열 분포', () => {
  const cases: [number[], number[]][] = [
    [
      [0.8, 0.6, 1, 0.4, 0.8],
      [0.2, 0.6, 0.4, 0, 0.6],
    ],
    [
      [0.3, 0.3, 0.9, 0.1],
      [0.5, 0.7, 0.2, 0.2, 0.6, 0.4],
    ],
    [
      [1, 1, 1],
      [0, 0, 0],
    ],
  ];
  const shifts = [0, 0.15, -0.15, 0.37];
  const tails: Tail[] = ['two-sided', 'greater', 'less'];

  it('모든 배치를 나열한 값과 같다 (옮김 포함, 표본 크기가 달라도)', () => {
    for (const [t, c] of cases) {
      const dist = permutationDistribution(t, c);
      expect(dist.method).toBe('exact');
      for (const shift of shifts) {
        for (const tail of tails) {
          expect(tailPValue(dist, shift, tail)).toBeCloseTo(bruteForce(t, c, shift, tail), 12);
        }
      }
    }
  });

  it('손으로 센 값: 1점 3회 대 0점 3회', () => {
    const dist = permutationDistribution([1, 1, 1], [0, 0, 0]);
    expect(tailPValue(dist, 0, 'greater')).toBeCloseTo(1 / 20, 12);
    expect(tailPValue(dist, 0, 'two-sided')).toBeCloseTo(2 / 20, 12);
  });

  it('두 조건 점수가 모두 같으면 차이 p = 1, 동등 p는 관측 배치 하나뿐이다', () => {
    const r = permutationTests(Array(10).fill(0.5), Array(10).fill(0.5), 0.15);
    expect(r.pDifference).toBe(1);
    expect(r.pEquivalence).toBeCloseTo(1 / 184_756, 15);
  });

  it('표본이 비면 오류다', () => {
    expect(() => permutationDistribution([], [1])).toThrow(RangeError);
  });
});

describe('몬테카를로', () => {
  it('배치 수가 상한을 넘으면 몬테카를로로 바뀌고 정확값에 가깝다', () => {
    const t = [0.8, 0.6, 1, 0.4, 0.8, 0.6];
    const c = [0.2, 0.6, 0.4, 0, 0.6, 0.8];
    const exact = permutationDistribution(t, c);
    const mc = permutationDistribution(t, c, { exactLimit: 100, draws: 50_000, seed: 3 });
    expect(mc.method).toBe('monte-carlo');
    for (const shift of [0, 0.15, -0.15]) {
      expect(tailPValue(mc, shift, 'two-sided')).toBeCloseTo(
        tailPValue(exact, shift, 'two-sided'),
        2,
      );
    }
  });

  it('같은 시드면 같은 값이다', () => {
    const t = randomPasses(12, 10, 1).map((v) => v / 10);
    const c = randomPasses(12, 10, 2).map((v) => v / 10);
    expect(permutationDistribution(t, c).method).toBe('monte-carlo');
    const a = permutationTests(t, c, 0.15, { draws: 5_000 });
    const b = permutationTests(t, c, 0.15, { draws: 5_000 });
    expect(a).toEqual(b);
  });
});

describe('정수 표 (시뮬레이션용)', () => {
  it('일반 정확 계산과 같은 p값을 낸다', () => {
    for (const [n1, n2, items, seed] of [
      [5, 5, 4, 1],
      [4, 7, 6, 2],
      [7, 3, 3, 3],
      [8, 8, 12, 4],
    ] as const) {
      const t = randomPasses(n1, items, seed);
      const c = randomPasses(n2, items, seed + 100);
      const tables = gridTables(t, c, items);
      const dist = permutationDistribution(
        t.map((v) => v / items),
        c.map((v) => v / items),
      );
      for (const shift of [0, 0.15, -0.15]) {
        for (const tail of ['two-sided', 'greater', 'less'] as const) {
          expect(gridTailPValue(tables, shift, tail)).toBeCloseTo(
            tailPValue(dist, shift, tail),
            12,
          );
        }
      }
      const fast = gridTests(tables, 0.15);
      const slow = permutationTests(
        t.map((v) => v / items),
        c.map((v) => v / items),
        0.15,
      );
      expect(fast.pDifference).toBeCloseTo(slow.pDifference, 12);
      expect(fast.pEquivalence).toBeCloseTo(slow.pEquivalence, 12);
      expect(fast.meanDifference).toBeCloseTo(slow.meanDifference, 12);
    }
  });
});

describe('permutationInterval', () => {
  const t = [0.9, 0.8, 1, 0.7, 0.9, 0.8, 1, 0.9, 0.6, 0.8];
  const c = [0.4, 0.5, 0.3, 0.6, 0.5, 0.2, 0.4, 0.5, 0.6, 0.3];

  it('구간은 평균 차이를 포함하고, 경계 안쪽은 받아들이고 바깥은 기각한다', () => {
    const i = permutationInterval(t, c, 0.05, { tolerance: 1e-6 });
    const center = 0.84 - 0.43;
    expect(i.lower).toBeLessThan(center);
    expect(i.upper).toBeGreaterThan(center);
    expect(i.lower).toBeGreaterThan(0);
    const dist = permutationDistribution(t, c);
    const p = (theta: number): number => tailPValue(dist, -theta, 'two-sided');
    expect(p(i.lower + 1e-4)).toBeGreaterThan(0.05);
    expect(p(i.lower - 1e-4)).toBeLessThanOrEqual(0.05);
    expect(p(i.upper - 1e-4)).toBeGreaterThan(0.05);
    expect(p(i.upper + 1e-4)).toBeLessThanOrEqual(0.05);
  });

  it('실행 3회씩이면 가능한 최소 p(0.1)가 α보다 커서 경계가 없다', () => {
    const i = permutationInterval([1, 1, 1], [0, 0, 0], 0.05);
    expect(i.lower).toBe(-Infinity);
    expect(i.upper).toBe(Infinity);
  });
});
