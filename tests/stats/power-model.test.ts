import { describe, expect, it } from 'vitest';
import {
  fitRandomIntercept,
  gaussHermite,
  populationMean,
  type TaskCounts,
} from '../../src/stats/glmm.js';
import { mulberry32 } from '../../src/stats/paired.js';
import { meanLift, simulateVerdicts, solveShift } from '../../src/stats/simulate.js';
import { injectedPowerCurve, splitHalfCheck } from '../../src/stats/selfcheck.js';

describe('gaussHermite', () => {
  it('표준정규의 0~4차 적률을 맞힌다', () => {
    const q = gaussHermite(20);
    const moment = (k: number): number =>
      q.nodes.reduce((s, z, i) => s + (q.weights[i] ?? 0) * z ** k, 0);
    expect(moment(0)).toBeCloseTo(1, 10);
    expect(moment(1)).toBeCloseTo(0, 10);
    expect(moment(2)).toBeCloseTo(1, 10);
    expect(moment(4)).toBeCloseTo(3, 9);
  });
});

describe('fitRandomIntercept', () => {
  it('과제 간 분산이 없으면 τ 추정은 0 근처이고 평균을 맞힌다', () => {
    const data: TaskCounts[] = Array.from({ length: 12 }, (_, i) => ({
      successes: i % 2 === 0 ? 3 : 2,
      trials: 6,
    }));
    const fit = fitRandomIntercept(data);
    expect(fit.tau).toBeLessThan(0.3);
    expect(populationMean(fit.mu, fit.tau)).toBeCloseTo(2.5 / 6, 2);
    expect(fit.tauUpper).toBeGreaterThan(fit.tau);
  });

  it('과제마다 점수가 크게 다르면 τ가 크게 나온다', () => {
    const random = mulberry32(4);
    const data: TaskCounts[] = Array.from({ length: 30 }, () => {
      const p = random() < 0.5 ? 0.1 : 0.9;
      let s = 0;
      for (let j = 0; j < 6; j++) if (random() < p) s++;
      return { successes: s, trials: 6 };
    });
    const fit = fitRandomIntercept(data);
    expect(fit.tau).toBeGreaterThan(1.5);
    expect(fit.tauUpper).toBeGreaterThanOrEqual(fit.tau);
  });
});

describe('solveShift', () => {
  it('푼 이동량에서 평균 상승이 δ다', () => {
    for (const het of [0, 1]) {
      const c = solveShift(-0.5, 1, 0.15, het);
      expect(c).not.toBeNull();
      expect(meanLift(-0.5, 1, c ?? 0, het)).toBeCloseTo(0.15, 6);
    }
  });
});

describe('simulateVerdicts', () => {
  const model = { mu: -0.3, tau: 0.5, items: 3, tasks: 12 };
  it('효과가 없으면 높음은 드물다', () => {
    const rates = simulateVerdicts({
      p1: model,
      p2: model,
      k: 4,
      scenario: 'null',
      shift: { p1: 0, p2: 0 },
      iterations: 100,
      alpha: 0.05,
      delta: 0.15,
      seed: 1,
    });
    expect(rates.H1.higher).toBeLessThan(0.1);
  });

  it('효과가 크면 높음이 많다', () => {
    const rates = simulateVerdicts({
      p1: model,
      p2: model,
      k: 6,
      scenario: 'shift',
      shift: { p1: 2, p2: 2 },
      iterations: 100,
      alpha: 0.05,
      delta: 0.15,
      seed: 2,
    });
    expect(rates.H1.higher).toBeGreaterThan(0.8);
  });
});

describe('selfcheck', () => {
  const runs = Array.from({ length: 10 }, (_, t) =>
    Array.from({ length: 6 }, (_, r): number[] => [(t + r) % 2, t % 3 === 0 ? 1 : 0, 0]),
  );
  it('반분 재표집은 비율을 0~1 사이로 낸다', () => {
    const s = splitHalfCheck(runs, 50, 0.05, 0.15, 1);
    expect(s.tasks).toBe(10);
    expect(s.directionalRate).toBeGreaterThanOrEqual(0);
    expect(s.directionalRate).toBeLessThanOrEqual(1);
  });

  it('주입 강도가 크면 검출률이 오른다', () => {
    const [weak, strong] = injectedPowerCurve(runs, [0, 0.8], 50, 0.05, 0.15, 2);
    expect(weak?.detectionRate ?? 1).toBeLessThan(strong?.detectionRate ?? 0);
    expect(strong?.injectedDifference ?? 0).toBeGreaterThan(0.3);
  });
});
