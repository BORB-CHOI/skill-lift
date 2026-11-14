/**
 * 로짓 척도 무작위 절편 모형 (설계 8.1의 1단계).
 *
 * 모형: 과제 i의 항목 관측 y_ij ~ Bernoulli(p_i), logit(p_i) = μ + u_i, u_i ~ N(0, τ²).
 * 과제 안의 항목과 반복은 p_i가 주어지면 서로 독립이라고 본다. 그래서 과제 i는 (성공 수, 관측 수)
 * 두 값으로 요약된다.
 *
 * 추정: 주변 가능도를 Gauss–Hermite 구적법(기본 20점)으로 적분하고 최대화한다. lme4 glmer의
 * nAGQ 방식과 같은 계열이다. μ에 대한 로그 가능도는 오목하므로(Prékopa 정리) τ를 고정하면
 * 황금분할 탐색으로 μ를 정확히 찾는다. τ는 격자로 훑어 프로파일 가능도를 만든다.
 *
 * τ²의 95% 상한: 프로파일 가능도 비 2(ℓ̂ − ℓ_p(τ)) ≤ χ²₁(0.95) = 3.841을 만족하는 가장 큰 τ.
 *
 * 한계: 항목마다 난이도가 다른 효과(항목 무작위 효과)를 넣지 않았다. 과제 안의 항목 이질성은
 * 이항 분산보다 실행 평균의 분산을 작게 만들므로, 이 모형은 과제 안 분산을 크게 잡아
 * 검출력을 낮게(보수적으로) 계산한다.
 */

export interface TaskCounts {
  readonly successes: number;
  readonly trials: number;
}

export interface Quadrature {
  /** 표준정규 변수의 절점. */
  readonly nodes: readonly number[];
  /** 표준정규 밀도에 대한 가중치. 합이 1이다. */
  readonly weights: readonly number[];
}

/**
 * Gauss–Hermite 절점과 가중치 (Numerical Recipes gauher 알고리즘).
 * 물리학자용 Hermite 다항식의 근 x와 가중치 w를 구한 뒤 표준정규로 바꾼다:
 * ∫ f(z) φ(z) dz ≈ Σ (w/√π) f(√2 x).
 */
export function gaussHermite(n = 20): Quadrature {
  const x = new Array<number>(n).fill(0);
  const w = new Array<number>(n).fill(0);
  const m = Math.floor((n + 1) / 2);
  const pim4 = Math.PI ** -0.25;
  let z = 0;
  for (let i = 0; i < m; i++) {
    if (i === 0) z = Math.sqrt(2 * n + 1) - 1.85575 * (2 * n + 1) ** (-1 / 6);
    else if (i === 1) z -= (1.14 * n ** 0.426) / z;
    else if (i === 2) z = 1.86 * z - 0.86 * (x[0] ?? 0);
    else if (i === 3) z = 1.91 * z - 0.91 * (x[1] ?? 0);
    else z = 2 * z - (x[i - 2] ?? 0);
    let pp = 0;
    for (let iter = 0; iter < 100; iter++) {
      let p1 = pim4;
      let p2 = 0;
      for (let j = 0; j < n; j++) {
        const p3 = p2;
        p2 = p1;
        p1 = z * Math.sqrt(2 / (j + 1)) * p2 - Math.sqrt(j / (j + 1)) * p3;
      }
      pp = Math.sqrt(2 * n) * p2;
      const z1 = z;
      z = z1 - p1 / pp;
      if (Math.abs(z - z1) <= 1e-14) break;
    }
    x[i] = z;
    x[n - 1 - i] = -z;
    w[i] = 2 / (pp * pp);
    w[n - 1 - i] = w[i] ?? 0;
  }
  return {
    nodes: x.map((v) => Math.SQRT2 * v),
    weights: w.map((v) => v / Math.sqrt(Math.PI)),
  };
}

const logistic = (t: number): number => 1 / (1 + Math.exp(-t));

/** log(1 + e^t)를 넘침 없이 계산한다. */
const softplus = (t: number): number =>
  t > 0 ? t + Math.log1p(Math.exp(-t)) : Math.log1p(Math.exp(t));

/** 이항 계수 항을 뺀 주변 로그 가능도. τ, μ 비교에는 상수항이 필요 없다. */
export function marginalLogLik(
  data: readonly TaskCounts[],
  mu: number,
  tau: number,
  quad: Quadrature,
): number {
  let total = 0;
  for (const { successes, trials } of data) {
    // log Σ_k w_k exp(ℓ_k)를 최댓값을 빼서 안정적으로 계산한다.
    const logs = quad.nodes.map((z, k) => {
      const eta = mu + tau * z;
      return Math.log(quad.weights[k] ?? 0) + successes * eta - trials * softplus(eta);
    });
    const peak = Math.max(...logs);
    let sum = 0;
    for (const l of logs) sum += Math.exp(l - peak);
    total += peak + Math.log(sum);
  }
  return total;
}

const MU_RANGE = 12;

/** τ를 고정하고 μ를 황금분할 탐색으로 최대화한다. */
function profileMu(
  data: readonly TaskCounts[],
  tau: number,
  quad: Quadrature,
): { mu: number; logLik: number } {
  const ratio = (Math.sqrt(5) - 1) / 2;
  let lo = -MU_RANGE;
  let hi = MU_RANGE;
  let a = hi - ratio * (hi - lo);
  let b = lo + ratio * (hi - lo);
  let fa = marginalLogLik(data, a, tau, quad);
  let fb = marginalLogLik(data, b, tau, quad);
  while (hi - lo > 1e-7) {
    if (fa < fb) {
      lo = a;
      a = b;
      fa = fb;
      b = lo + ratio * (hi - lo);
      fb = marginalLogLik(data, b, tau, quad);
    } else {
      hi = b;
      b = a;
      fb = fa;
      a = hi - ratio * (hi - lo);
      fa = marginalLogLik(data, a, tau, quad);
    }
  }
  const mu = (lo + hi) / 2;
  return { mu, logLik: marginalLogLik(data, mu, tau, quad) };
}

export interface RandomInterceptFit {
  readonly mu: number;
  readonly tau: number;
  /** 프로파일 가능도 95% 상한. 격자 끝에 닿았으면 그 값이고 capped가 true다. */
  readonly tauUpper: number;
  /** τ 상한에서 다시 맞춘 μ. 시뮬레이션은 (muAtUpper, tauUpper)를 쓴다. */
  readonly muAtUpper: number;
  readonly capped: boolean;
  readonly logLik: number;
  readonly tasks: number;
  readonly trials: number;
  /** 원 척도의 관측 평균 (참고). */
  readonly observedMean: number;
}

export interface FitOptions {
  readonly quadraturePoints?: number;
  readonly tauMax?: number;
  readonly tauStep?: number;
}

const CHI2_1_95 = 3.841458820694124;

export function fitRandomIntercept(
  data: readonly TaskCounts[],
  options: FitOptions = {},
): RandomInterceptFit {
  if (data.length < 2) throw new RangeError('과제가 2개 이상 필요하다');
  const quad = gaussHermite(options.quadraturePoints ?? 20);
  const tauMax = options.tauMax ?? 8;
  const step = options.tauStep ?? 0.01;

  const profile: { tau: number; mu: number; logLik: number }[] = [];
  for (let tau = 0; tau <= tauMax + 1e-12; tau += step) {
    profile.push({ tau, ...profileMu(data, tau, quad) });
  }
  let best = profile[0];
  for (const row of profile) if (best === undefined || row.logLik > best.logLik) best = row;
  if (best === undefined) throw new Error('프로파일이 비었다');

  let upper = best;
  let capped = true;
  for (const row of profile) {
    if (row.tau < best.tau) continue;
    if (2 * (best.logLik - row.logLik) > CHI2_1_95) {
      capped = false;
      break;
    }
    upper = row;
  }
  const successes = data.reduce((s, t) => s + t.successes, 0);
  const trials = data.reduce((s, t) => s + t.trials, 0);
  return {
    mu: best.mu,
    tau: best.tau,
    tauUpper: upper.tau,
    muAtUpper: upper.mu,
    capped,
    logLik: best.logLik,
    tasks: data.length,
    trials,
    observedMean: successes / trials,
  };
}

/** 모형의 모집단 평균 점수 E[logistic(μ + τZ)]. */
export function populationMean(mu: number, tau: number, quad: Quadrature = gaussHermite()): number {
  let sum = 0;
  quad.nodes.forEach((z, k) => {
    sum += (quad.weights[k] ?? 0) * logistic(mu + tau * z);
  });
  return sum;
}
