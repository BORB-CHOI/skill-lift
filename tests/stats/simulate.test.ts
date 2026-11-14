import { describe, expect, it } from 'vitest';
import { chi2Cdf, chi2Quantile } from '../../src/stats/chisq.js';
import { mulberry32 } from '../../src/stats/paired.js';
import {
  betaBinomialSd,
  drawPasses,
  fitDispersion,
  pooledSd,
  sdUpperBound,
  simulatePower,
  simulationMean,
  type CellModel,
} from '../../src/stats/simulate.js';

describe('카이제곱', () => {
  it('표의 5% 분위수와 같다', () => {
    // R: qchisq(0.05, c(1, 5, 10, 30))
    expect(chi2Quantile(0.05, 1)).toBeCloseTo(0.00393214, 7);
    expect(chi2Quantile(0.05, 5)).toBeCloseTo(1.145476, 5);
    expect(chi2Quantile(0.05, 10)).toBeCloseTo(3.940299, 5);
    expect(chi2Quantile(0.05, 30)).toBeCloseTo(18.49266, 4);
  });

  it('누적분포와 분위수가 서로 역이다', () => {
    expect(chi2Cdf(chi2Quantile(0.95, 7), 7)).toBeCloseTo(0.95, 10);
  });
});

describe('표준편차 추정', () => {
  it('조건별 평균에서 잰 편차를 합친다', () => {
    // 각 조건 편차제곱합: [0,1] → 0.5, [0.5,0.5,0.5] → 0, [1] → 자유도 0이라 뺀다.
    const pooled = pooledSd([[0, 1], [0.5, 0.5, 0.5], [1]]);
    expect(pooled?.df).toBe(3);
    expect(pooled?.sd).toBeCloseTo(Math.sqrt(0.5 / 3), 12);
    expect(pooledSd([[1], [0]])).toBeNull();
  });

  it('95% 상한은 sqrt(df·s²/χ²_{0.05,df})다', () => {
    expect(sdUpperBound(0.2, 10)).toBeCloseTo(Math.sqrt((10 * 0.04) / 3.940299), 5);
    expect(sdUpperBound(0.2, 10)).toBeGreaterThan(0.2);
  });
});

describe('베타-이항 모형', () => {
  it('ρ를 풀면 목표 표준편차가 나온다', () => {
    const d = fitDispersion(0.5, 10, 0.3);
    expect(d.clamped).toBeNull();
    expect(d.achievedSd).toBeCloseTo(0.3, 10);
    expect(betaBinomialSd(0.5, 10, d.rho)).toBeCloseTo(0.3, 10);
  });

  it('이항 분산보다 작은 목표는 ρ = 0으로 자른다', () => {
    const d = fitDispersion(0.5, 10, 0.01);
    expect(d).toMatchObject({ rho: 0, clamped: 'floor' });
  });

  it('baseline 평균은 1 − δ 이하, 목표 분산에 닿는 값 이상으로 자른다', () => {
    expect(simulationMean(0.95, 0.1, 0.15)).toBeCloseTo(0.85, 12);
    // sd = 0.4: μ(1 − μ) >= 0.16인 가장 작은 μ = 0.2
    expect(simulationMean(0, 0.4, 0.15)).toBeCloseTo(0.2, 12);
  });

  it('뽑은 점수의 평균과 표준편차가 모형값에 가깝다', () => {
    const random = mulberry32(7);
    const items = 8;
    const { rho } = fitDispersion(0.4, items, 0.25);
    const scores = Array.from(
      { length: 20_000 },
      () => drawPasses(0.4, rho, items, random) / items,
    );
    const m = scores.reduce((s, v) => s + v, 0) / scores.length;
    const sd = Math.sqrt(scores.reduce((s, v) => s + (v - m) ** 2, 0) / (scores.length - 1));
    expect(m).toBeCloseTo(0.4, 2);
    expect(sd).toBeCloseTo(0.25, 2);
  });
});

describe('simulatePower', () => {
  const cells: CellModel[] = [
    { project: 'a', model: 'm', items: 10, mu: 0.5, rho: 0.05 },
    { project: 'b', model: 'm', items: 10, mu: 0.5, rho: 0.05 },
  ];
  const base = { cells, iterations: 60, alpha: 0.05, delta: 0.15, seed: 1 };

  it('효과 0에서는 높음·낮음이 드물다', () => {
    const rates = simulatePower({ ...base, k: 8, scenario: 'null' });
    for (const row of Object.values(rates)) {
      expect(row.higher + row.lower).toBeLessThan(0.1);
      expect(row.higher + row.lower + row.equivalent + row.inconclusive).toBeCloseTo(1, 12);
    }
  });

  it('실행이 많을수록 효과 δ를 더 자주 높음으로 판정한다', () => {
    // 항목 20개, ρ = 0이면 SD ≈ 0.11. K = 12에서 차이의 표준오차 ≈ 0.046, δ/SE ≈ 3.3.
    const tight = cells.map((c) => ({ ...c, items: 20, rho: 0 }));
    const few = simulatePower({ ...base, cells: tight, k: 3, scenario: 'effect' });
    const many = simulatePower({ ...base, cells: tight, k: 12, scenario: 'effect' });
    const key = 'a/m/baseline';
    // K = 3이면 가능한 최소 p(0.1)가 α보다 커서 높음이 나올 수 없다.
    expect(few[key]?.higher).toBe(0);
    expect(many[key]?.higher ?? 0).toBeGreaterThan(0.5);
  });

  it('같은 시드면 같은 결과다', () => {
    const a = simulatePower({ ...base, k: 5, scenario: 'effect' });
    const b = simulatePower({ ...base, k: 5, scenario: 'effect' });
    expect(a).toEqual(b);
  });
});
