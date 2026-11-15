# es-toolkit 전환 평가 결과: main-project

실행 96개. 프로젝트 recharts, swagger-typescript-api × 모델 Sonnet 5.5, Haiku 5.5, 가설 8개. α = 0.05, δ = ±15pp, 사전 등록 K = 8.

## 1. 조건별 실행 점수

실행 점수는 통과한 채점 항목의 비율이다. 시간·턴 한도로 끝난 실행은 0점으로 넣고, 오염·인프라 실패·하네스 결함·채점 없음 실행은 뺀다.

| 프로젝트 | 모델 | 조건 | 분석 실행 | 평균 | 표준편차 |
|---|---|---|---|---|---|
| recharts | Sonnet 5.5 | baseline | 8 | 97.3% | 0.0% |
| recharts | Sonnet 5.5 | skill | 8 | 97.3% | 0.0% |
| recharts | Sonnet 5.5 | placebo | 8 | 97.3% | 0.0% |
| recharts | Haiku 5.5 | baseline | 8 | 97.3% | 0.0% |
| recharts | Haiku 5.5 | skill | 8 | 97.3% | 0.0% |
| recharts | Haiku 5.5 | placebo | 8 | 97.3% | 0.0% |
| swagger-typescript-api | Sonnet 5.5 | baseline | 8 | 99.7% | 0.9% |
| swagger-typescript-api | Sonnet 5.5 | skill | 8 | 98.8% | 1.3% |
| swagger-typescript-api | Sonnet 5.5 | placebo | 8 | 92.5% | 16.2% |
| swagger-typescript-api | Haiku 5.5 | baseline | 8 | 99.4% | 1.2% |
| swagger-typescript-api | Haiku 5.5 | skill | 8 | 99.4% | 1.2% |
| swagger-typescript-api | Haiku 5.5 | placebo | 8 | 98.8% | 1.3% |

## 2. 가설별 판정

차이는 skill 평균 − 대조 평균이다. p값은 두 표본 순열 검정이다. 배치 수 C(n1 + n2, n1)가 200,000 이하면 모든 배치를 세고, 넘으면 시드를 고정한 무작위 배치 200,000개로 계산한다. 동등 p는 처리 표본을 ±δ 옮긴 두 단측 순열 검정 중 큰 값이다. 95% 구간은 순열 검정을 뒤집어 구했고 Holm 보정 전 값이다. Holm 보정은 차이 검정 8개와 동등 검정 8개에 따로 적용했다.

| 프로젝트 | 모델 | 대조 | skill 실행 | 대조 실행 | 평균 차이 | 95% 구간 | 계산 | 차이 p | Holm 조정 p | 동등 p | Holm 조정 동등 p | 판정 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| recharts | Sonnet 5.5 | baseline | 8 | 8 | +0.0pp | [-0.0pp, +0.0pp] | 정확 | 1.0000 | 1.0000 | <0.0001 | 0.0006 | **동등** |
| recharts | Sonnet 5.5 | placebo | 8 | 8 | +0.0pp | [-0.0pp, +0.0pp] | 정확 | 1.0000 | 1.0000 | <0.0001 | 0.0006 | **동등** |
| recharts | Haiku 5.5 | baseline | 8 | 8 | +0.0pp | [-0.0pp, +0.0pp] | 정확 | 1.0000 | 1.0000 | <0.0001 | 0.0006 | **동등** |
| recharts | Haiku 5.5 | placebo | 8 | 8 | +0.0pp | [-0.0pp, +0.0pp] | 정확 | 1.0000 | 1.0000 | <0.0001 | 0.0006 | **동등** |
| swagger-typescript-api | Sonnet 5.5 | baseline | 8 | 8 | -0.9pp | [-2.5pp, +0.0pp] | 정확 | 0.2821 | 1.0000 | <0.0001 | 0.0006 | **동등** |
| swagger-typescript-api | Sonnet 5.5 | placebo | 8 | 8 | +6.3pp | [-0.6pp, +16.7pp] | 정확 | 0.3776 | 1.0000 | 0.1020 | 0.1020 | **판정 불가** |
| swagger-typescript-api | Haiku 5.5 | baseline | 8 | 8 | -0.0pp | [-1.3pp, +1.3pp] | 정확 | 1.0000 | 1.0000 | <0.0001 | 0.0006 | **동등** |
| swagger-typescript-api | Haiku 5.5 | placebo | 8 | 8 | +0.6pp | [-0.8pp, +1.9pp] | 정확 | 0.6084 | 1.0000 | <0.0001 | 0.0006 | **동등** |

## 3. 판정 문장과 결론

### recharts · Sonnet 5.5

- 평가 시스템은 recharts 전환에서 Sonnet 5.5의 공식 Skill 실행 점수가 baseline 실행과 ±15pp 안에서 같다고 판정한다.
- 평가 시스템은 recharts 전환에서 Sonnet 5.5의 공식 Skill 실행 점수가 placebo 실행과 ±15pp 안에서 같다고 판정한다.

**결론:** recharts 전환에서 공식 Skill은 Sonnet 5.5의 실행 점수를 15pp 넘게 바꾸지 않는다.

### recharts · Haiku 5.5

- 평가 시스템은 recharts 전환에서 Haiku 5.5의 공식 Skill 실행 점수가 baseline 실행과 ±15pp 안에서 같다고 판정한다.
- 평가 시스템은 recharts 전환에서 Haiku 5.5의 공식 Skill 실행 점수가 placebo 실행과 ±15pp 안에서 같다고 판정한다.

**결론:** recharts 전환에서 공식 Skill은 Haiku 5.5의 실행 점수를 15pp 넘게 바꾸지 않는다.

### swagger-typescript-api · Sonnet 5.5

- 평가 시스템은 swagger-typescript-api 전환에서 Sonnet 5.5의 공식 Skill 실행 점수가 baseline 실행과 ±15pp 안에서 같다고 판정한다.
- 평가 시스템은 swagger-typescript-api 전환에서 Sonnet 5.5의 공식 Skill 실행 점수가 placebo 실행보다 높은지, 낮은지, ±15pp 안에서 같은지 판정하지 못했다.

**결론:** swagger-typescript-api 전환에서 공식 Skill은 Sonnet 5.5의 실행 점수를 15pp 넘게 바꾸지 않는다.

### swagger-typescript-api · Haiku 5.5

- 평가 시스템은 swagger-typescript-api 전환에서 Haiku 5.5의 공식 Skill 실행 점수가 baseline 실행과 ±15pp 안에서 같다고 판정한다.
- 평가 시스템은 swagger-typescript-api 전환에서 Haiku 5.5의 공식 Skill 실행 점수가 placebo 실행과 ±15pp 안에서 같다고 판정한다.

**결론:** swagger-typescript-api 전환에서 공식 Skill은 Haiku 5.5의 실행 점수를 15pp 넘게 바꾸지 않는다.

## 4. 항목별 통과율

1절과 같은 실행을 쓴다. 한도 실행은 모든 항목을 실패로 센다. 조건 사이 차이가 큰 항목부터 적었다.

### recharts · Sonnet 5.5

| 항목 | 종류 | baseline | skill | placebo | skill − baseline | skill − placebo |
|---|---|---|---|---|---|---|
| esToolkitDeclared | esToolkitDeclared | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| lodashDependencyRemoved | lodashDependencyRemoved | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| lodashRemoved | lodashRemoved | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| projectTests | projectTests | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-01 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-02 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-03 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-04 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-05 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-06 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-07 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-08 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-09 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-10 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-11 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-12 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-13 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-14 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-15 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-16 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-17 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-18 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-19 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-20 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-21 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-22 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-23 | hidden | 0/8 (0.0%) | 0/8 (0.0%) | 0/8 (0.0%) | +0.0pp | +0.0pp |
| recharts-lodash-24 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-25 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-26 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-27 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-28 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-29 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-30 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-31 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-32 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| typecheck | typecheck | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |

### recharts · Haiku 5.5

| 항목 | 종류 | baseline | skill | placebo | skill − baseline | skill − placebo |
|---|---|---|---|---|---|---|
| esToolkitDeclared | esToolkitDeclared | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| lodashDependencyRemoved | lodashDependencyRemoved | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| lodashRemoved | lodashRemoved | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| projectTests | projectTests | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-01 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-02 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-03 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-04 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-05 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-06 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-07 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-08 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-09 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-10 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-11 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-12 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-13 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-14 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-15 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-16 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-17 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-18 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-19 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-20 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-21 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-22 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-23 | hidden | 0/8 (0.0%) | 0/8 (0.0%) | 0/8 (0.0%) | +0.0pp | +0.0pp |
| recharts-lodash-24 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-25 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-26 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-27 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-28 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-29 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-30 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-31 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| recharts-lodash-32 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| typecheck | typecheck | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |

### swagger-typescript-api · Sonnet 5.5

| 항목 | 종류 | baseline | skill | placebo | skill − baseline | skill − placebo |
|---|---|---|---|---|---|---|
| typecheck | typecheck | 7/8 (87.5%) | 4/8 (50.0%) | 2/8 (25.0%) | -37.5pp | +25.0pp |
| projectTests | projectTests | 8/8 (100.0%) | 8/8 (100.0%) | 7/8 (87.5%) | +0.0pp | +12.5pp |
| sta-02 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 7/8 (87.5%) | +0.0pp | +12.5pp |
| sta-03 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 7/8 (87.5%) | +0.0pp | +12.5pp |
| sta-04 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 7/8 (87.5%) | +0.0pp | +12.5pp |
| sta-05 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 7/8 (87.5%) | +0.0pp | +12.5pp |
| sta-06 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 7/8 (87.5%) | +0.0pp | +12.5pp |
| sta-07 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 7/8 (87.5%) | +0.0pp | +12.5pp |
| sta-23 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 7/8 (87.5%) | +0.0pp | +12.5pp |
| sta-24 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 7/8 (87.5%) | +0.0pp | +12.5pp |
| sta-25 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 7/8 (87.5%) | +0.0pp | +12.5pp |
| sta-26 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 7/8 (87.5%) | +0.0pp | +12.5pp |
| sta-27 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 7/8 (87.5%) | +0.0pp | +12.5pp |
| sta-28 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 7/8 (87.5%) | +0.0pp | +12.5pp |
| sta-29 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 7/8 (87.5%) | +0.0pp | +12.5pp |
| sta-30 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 7/8 (87.5%) | +0.0pp | +12.5pp |
| sta-31 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 7/8 (87.5%) | +0.0pp | +12.5pp |
| sta-32 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 7/8 (87.5%) | +0.0pp | +12.5pp |
| sta-35 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 7/8 (87.5%) | +0.0pp | +12.5pp |
| esToolkitDeclared | esToolkitDeclared | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| lodashDependencyRemoved | lodashDependencyRemoved | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| lodashRemoved | lodashRemoved | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-01 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-08 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-09 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-10 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-11 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-12 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-13 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-14 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-15 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-16 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-17 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-18 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-19 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-20 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-21 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-22 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-33 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-34 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |

### swagger-typescript-api · Haiku 5.5

| 항목 | 종류 | baseline | skill | placebo | skill − baseline | skill − placebo |
|---|---|---|---|---|---|---|
| projectTests | projectTests | 8/8 (100.0%) | 8/8 (100.0%) | 7/8 (87.5%) | +0.0pp | +12.5pp |
| typecheck | typecheck | 6/8 (75.0%) | 6/8 (75.0%) | 5/8 (62.5%) | +0.0pp | +12.5pp |
| esToolkitDeclared | esToolkitDeclared | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| lodashDependencyRemoved | lodashDependencyRemoved | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| lodashRemoved | lodashRemoved | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-01 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-02 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-03 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-04 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-05 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-06 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-07 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-08 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-09 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-10 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-11 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-12 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-13 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-14 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-15 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-16 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-17 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-18 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-19 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-20 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-21 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-22 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-23 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-24 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-25 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-26 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-27 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-28 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-29 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-30 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-31 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-32 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-33 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-34 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |
| sta-35 | hidden | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) | +0.0pp | +0.0pp |

## 5. 실행 상태

| 프로젝트 | 모델 | 조건 | 실행 | 정상 종료 | 한도 | 인프라 실패 | 하네스 결함 | 오염 | 오염 비율 | 채점 없음 |
|---|---|---|---|---|---|---|---|---|---|---|
| recharts | Sonnet 5.5 | baseline | 8 | 8 | 0 | 0 | 0 | 0 | 0.0% | 0 |
| recharts | Sonnet 5.5 | skill | 8 | 8 | 0 | 0 | 0 | 0 | 0.0% | 0 |
| recharts | Sonnet 5.5 | placebo | 8 | 8 | 0 | 0 | 0 | 0 | 0.0% | 0 |
| recharts | Haiku 5.5 | baseline | 8 | 8 | 0 | 0 | 0 | 0 | 0.0% | 0 |
| recharts | Haiku 5.5 | skill | 8 | 8 | 0 | 0 | 0 | 0 | 0.0% | 0 |
| recharts | Haiku 5.5 | placebo | 8 | 8 | 0 | 0 | 0 | 0 | 0.0% | 0 |
| swagger-typescript-api | Sonnet 5.5 | baseline | 8 | 8 | 0 | 0 | 0 | 0 | 0.0% | 0 |
| swagger-typescript-api | Sonnet 5.5 | skill | 8 | 8 | 0 | 0 | 0 | 0 | 0.0% | 0 |
| swagger-typescript-api | Sonnet 5.5 | placebo | 8 | 8 | 0 | 0 | 0 | 0 | 0.0% | 0 |
| swagger-typescript-api | Haiku 5.5 | baseline | 8 | 8 | 0 | 0 | 0 | 0 | 0.0% | 0 |
| swagger-typescript-api | Haiku 5.5 | skill | 8 | 8 | 0 | 0 | 0 | 0 | 0.0% | 0 |
| swagger-typescript-api | Haiku 5.5 | placebo | 8 | 8 | 0 | 0 | 0 | 0 | 0.0% | 0 |

## 6. 조작 확인

정상 종료와 한도 실행 가운데 해당 행동을 한 비율이다. Skill 로드는 init 메시지의 Skill 목록에 es-toolkit:migrate가 있었는지다. 그 값을 기록하지 않은 실행은 분모에서 뺀다.

| 프로젝트 | 모델 | 조건 | Skill 로드 | 외부 접근 시도 | ranAvailabilityCheck | ranLodashComparison | readEsToolkitSource |
|---|---|---|---|---|---|---|---|
| recharts | Sonnet 5.5 | baseline | 0/8 (0.0%) | 0/8 (0.0%) | 8/8 (100.0%) | 4/8 (50.0%) | 8/8 (100.0%) |
| recharts | Sonnet 5.5 | skill | 8/8 (100.0%) | 0/8 (0.0%) | 7/8 (87.5%) | 6/8 (75.0%) | 3/8 (37.5%) |
| recharts | Sonnet 5.5 | placebo | 8/8 (100.0%) | 0/8 (0.0%) | 7/8 (87.5%) | 4/8 (50.0%) | 7/8 (87.5%) |
| recharts | Haiku 5.5 | baseline | 0/8 (0.0%) | 1/8 (12.5%) | 8/8 (100.0%) | 3/8 (37.5%) | 8/8 (100.0%) |
| recharts | Haiku 5.5 | skill | 8/8 (100.0%) | 0/8 (0.0%) | 8/8 (100.0%) | 3/8 (37.5%) | 8/8 (100.0%) |
| recharts | Haiku 5.5 | placebo | 8/8 (100.0%) | 0/8 (0.0%) | 8/8 (100.0%) | 8/8 (100.0%) | 8/8 (100.0%) |
| swagger-typescript-api | Sonnet 5.5 | baseline | 0/8 (0.0%) | 0/8 (0.0%) | 8/8 (100.0%) | 1/8 (12.5%) | 8/8 (100.0%) |
| swagger-typescript-api | Sonnet 5.5 | skill | 8/8 (100.0%) | 0/8 (0.0%) | 8/8 (100.0%) | 3/8 (37.5%) | 7/8 (87.5%) |
| swagger-typescript-api | Sonnet 5.5 | placebo | 8/8 (100.0%) | 0/8 (0.0%) | 8/8 (100.0%) | 2/8 (25.0%) | 8/8 (100.0%) |
| swagger-typescript-api | Haiku 5.5 | baseline | 0/8 (0.0%) | 0/8 (0.0%) | 8/8 (100.0%) | 4/8 (50.0%) | 8/8 (100.0%) |
| swagger-typescript-api | Haiku 5.5 | skill | 8/8 (100.0%) | 0/8 (0.0%) | 8/8 (100.0%) | 5/8 (62.5%) | 8/8 (100.0%) |
| swagger-typescript-api | Haiku 5.5 | placebo | 8/8 (100.0%) | 0/8 (0.0%) | 8/8 (100.0%) | 6/8 (75.0%) | 8/8 (100.0%) |

## 7. 비용·시간·턴 (판정하지 않음)

오염 실행을 뺀 모든 실행의 턴 기록 합이다. 단가는 사전 등록의 모델별 값(1M 토큰당 USD)이다.

| 프로젝트 | 모델 | 조건 | 평균 비용(USD) | 총 비용(USD) | 평균 시간(분) | 평균 턴 |
|---|---|---|---|---|---|---|
| recharts | Sonnet 5.5 | baseline | 0.0922 | 0.74 | 7.0 | 7.3 |
| recharts | Sonnet 5.5 | skill | 0.0973 | 0.78 | 1.8 | 6.9 |
| recharts | Sonnet 5.5 | placebo | 0.0968 | 0.77 | 3.4 | 6.9 |
| recharts | Haiku 5.5 | baseline | 0.0344 | 0.28 | 9.5 | 27.5 |
| recharts | Haiku 5.5 | skill | 0.0349 | 0.28 | 6.8 | 24.6 |
| recharts | Haiku 5.5 | placebo | 0.0594 | 0.48 | 11.6 | 63.6 |
| swagger-typescript-api | Sonnet 5.5 | baseline | 0.2099 | 1.68 | 5.4 | 15.9 |
| swagger-typescript-api | Sonnet 5.5 | skill | 0.2077 | 1.66 | 5.1 | 15.1 |
| swagger-typescript-api | Sonnet 5.5 | placebo | 0.2160 | 1.73 | 4.4 | 15.6 |
| swagger-typescript-api | Haiku 5.5 | baseline | 0.0457 | 0.37 | 6.0 | 31.6 |
| swagger-typescript-api | Haiku 5.5 | skill | 0.0457 | 0.37 | 6.5 | 33.8 |
| swagger-typescript-api | Haiku 5.5 | placebo | 0.0845 | 0.68 | 9.7 | 68.3 |

분석 범위 실행의 총 비용: 9.80 USD.
판정에 쓴 실행: 96개.
