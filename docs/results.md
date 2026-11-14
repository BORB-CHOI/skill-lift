# 본 실험 결과

**결론:** recharts와 swagger-typescript-api 전체를 lodash에서 es-toolkit으로 옮기는 과제에서, 공식 Skill `es-toolkit:migrate`는 Sonnet 5.5와 Haiku 5.5의 실행 점수를 Skill 없는 실행 대비 ±15pp 밖으로 바꾸지 않았다. 사전 등록한 판정 8개 가운데 7개가 "동등"이고, swagger-typescript-api · Sonnet 5.5의 placebo 대조 1개가 "판정 불가"다. "높다" 또는 "낮다"로 나온 판정은 없다.

- 실행: 96회(프로젝트 2 × 모델 2 × 조건 3 × 반복 8), 2026-11-15
- 사전 등록: 태그 `prereg-project-v1`(커밋 `c5ba9e9`), 판정 규칙은 [design.md](design.md) 6~8절
- 판정 보고서 원본: [data/main-project-report.md](data/main-project-report.md)
- 실행별 요약: [data/main-project-runs.csv](data/main-project-runs.csv)

## 1. 판정

차이는 "공식 Skill 실행의 평균 점수 − 대조 조건의 평균 점수"다. 점수는 실행마다 통과한 채점 항목의 비율이다(recharts 37개, swagger-typescript-api 40개 항목). 동등은 차이의 95% 구간이 ±15pp 안에 들어간다는 뜻이고, Holm 보정 후 동등 검정 p < 0.05로 판정했다.

| 프로젝트               | 모델       | 대조     | Skill 평균 | 대조 평균 | 차이   | 95% 구간      | Holm 조정 동등 p | 판정      |
| ---------------------- | ---------- | -------- | ---------- | --------- | ------ | ------------- | ---------------- | --------- |
| recharts               | Sonnet 5.5 | baseline | 97.3%      | 97.3%     | +0.0pp | [−0.0, +0.0]  | 0.0006           | 동등      |
| recharts               | Sonnet 5.5 | placebo  | 97.3%      | 97.3%     | +0.0pp | [−0.0, +0.0]  | 0.0006           | 동등      |
| recharts               | Haiku 5.5  | baseline | 97.3%      | 97.3%     | +0.0pp | [−0.0, +0.0]  | 0.0006           | 동등      |
| recharts               | Haiku 5.5  | placebo  | 97.3%      | 97.3%     | +0.0pp | [−0.0, +0.0]  | 0.0006           | 동등      |
| swagger-typescript-api | Sonnet 5.5 | baseline | 98.8%      | 99.7%     | −0.9pp | [−2.5, +0.0]  | 0.0006           | 동등      |
| swagger-typescript-api | Sonnet 5.5 | placebo  | 98.8%      | 92.5%     | +6.3pp | [−0.6, +16.7] | 0.1020           | 판정 불가 |
| swagger-typescript-api | Haiku 5.5  | baseline | 99.4%      | 99.4%     | −0.0pp | [−1.3, +1.3]  | 0.0006           | 동등      |
| swagger-typescript-api | Haiku 5.5  | placebo  | 99.4%      | 98.8%     | +0.6pp | [−0.8, +1.9]  | 0.0006           | 동등      |

판정 문장은 주어와 비교 대상을 밝혀 쓴다.

- 평가 시스템은 recharts 전환에서 Sonnet 5.5와 Haiku 5.5 모두, 공식 Skill 실행 점수가 baseline 실행·placebo 실행과 ±15pp 안에서 같다고 판정한다.
- 평가 시스템은 swagger-typescript-api 전환에서 Haiku 5.5의 공식 Skill 실행 점수가 baseline 실행·placebo 실행과 ±15pp 안에서 같다고 판정한다.
- 평가 시스템은 swagger-typescript-api 전환에서 Sonnet 5.5의 공식 Skill 실행 점수가 baseline 실행과 ±15pp 안에서 같다고 판정한다. placebo 실행과 비교한 판정은 내리지 못했다.

swagger-typescript-api · Sonnet 5.5의 placebo 판정이 불가로 나온 원인은 placebo 실행 1개(`placebo__6`, 52.5점)다. 이 실행을 빼면 placebo 평균은 98.2%다. 사전 등록 규칙상 정상 종료한 실행은 빼지 않으므로 판정은 그대로 둔다. 이 실행에서 무엇이 깨졌는지는 3절에 적었다.

사전 등록한 결론 표([design.md](design.md) 6절)에 따르면 네 셀 모두 "공식 Skill은 이 프로젝트·모델에서 실행 점수를 15pp 넘게 바꾸지 않는다"로 이어진다. swagger-typescript-api · Sonnet 5.5는 baseline 대조가 동등이고 placebo 대조가 판정 불가인 경우라서 같은 결론 행에 들어간다.

## 2. 왜 차이가 없었나

Skill 없는 baseline이 이미 97~100%를 통과했다. 세 조건이 공통으로 놓친 항목은 두 종류뿐이었고, 둘 다 Skill 내용과 상관없이 생겼다.

| 공통 실패 항목                                      | 실패 실행                                                                                   | 원인                                                                                                                                                                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| recharts 숨김 검사 `recharts-lodash-23`(`throttle`) | 48/48, 모든 조건                                                                            | `ResponsiveContainer`의 `throttle(leading: false, trailing: true)`를 es-toolkit으로 옮기면, `wait` 이후에 들어온 호출이 대기 중인 trailing 호출을 취소한다. 사람이 머지한 PR #5811도 같은 지점에서 실패한다. |
| swagger-typescript-api `typecheck`(tsdown 빌드)     | Sonnet: baseline 1/8, skill 4/8, placebo 6/8<br>Haiku: baseline 2/8, skill 2/8, placebo 3/8 | `lodash` 기본 객체를 `es-toolkit/compat`의 `_`로 바꾸면 공개 API `generateApi`의 타입이 `es-toolkit/dist/compat/toolkit.mjs`를 참조하게 되어 d.ts 생성이 TS2742로 실패한다.                                  |

Skill이 권하는 전략을 따랐는지도 측정했다. Skill(`SKILL.md` Option B)과 es-toolkit 문서는 "먼저 `es-toolkit/compat`으로 바꾸고, 그다음 본체로 옮긴다"를 권한다. 그런데 baseline도 lodash 호출 지점의 77~99%를 compat으로 옮겼다. 모델이 이미 이 전략을 알고 있어서 Skill이 덧붙일 정보가 거의 없었다.

| 프로젝트 · 모델                     | compat으로 옮긴 호출 지점 비율 (baseline / skill / placebo) |
| ----------------------------------- | ----------------------------------------------------------- |
| recharts · Sonnet 5.5               | 98% / 100% / 100%                                           |
| recharts · Haiku 5.5                | 77% / 61% / 72%                                             |
| swagger-typescript-api · Sonnet 5.5 | 98% / 99% / 99%                                             |
| swagger-typescript-api · Haiku 5.5  | 99% / 100% / 84%                                            |

swagger-typescript-api · Sonnet 5.5의 타입 검사 실패는 skill 4/8, baseline 1/8로 차이가 있다. 하지만 사전 등록한 판정 대상이 아니고, 8회씩이라 Fisher 정확 검정 p = 0.28로 우연과 구분되지 않는다. 탐색 관찰로만 적는다.

## 3. 채점기가 잡은 회귀

swagger-typescript-api의 `SchemaFormatters.formatDescription`은 lodash 체이닝 래퍼를 쓴다(`lodash._(description).split(...).compact().join(" ")`). `swagger-typescript-api__sonnet__placebo__6`은 이 파일의 import만 `es-toolkit/compat`으로 바꾸고 `lodash._(...)` 호출은 그대로 뒀다. compat의 default export에는 호출할 수 있는 `_`가 없어서 `TypeError: _ is not a function`이 났다. 기존 테스트 134개 중 31개와 숨김 검사 17개가 같은 오류로 실패했다. lodash 제거, 의존성 정리, es-toolkit 선언 항목은 모두 통과한 실행이다. lodash가 사라졌는지만 확인하는 채점이었다면 이 실행은 성공으로 기록됐다.

## 4. 실행 품질

| 확인 항목                   | 결과                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| 실행 상태                   | 96/96 정상 종료. 시간·턴 한도(29분, 182턴) 도달 0회, 인프라 실패 0회                             |
| 오염(프록시 우회·정답 접근) | 0회                                                                                              |
| 외부 접근 시도(기록만)      | 1회. `recharts__haiku__baseline__7`이 package.json을 고치는 스크립트에 URL 문자열을 넣었다       |
| Skill 로드                  | skill·placebo 48/48 실행의 init 메시지에 `es-toolkit:migrate`가 있었고, baseline 48회에는 없었다 |
| 채점                        | 96/96 채점, 오류 0회                                                                             |
| 최대 턴·시간                | 181턴, 1,376초. 둘 다 한도 안이다                                                                |

비용은 사전 등록한 단가(1M 토큰당 USD)로 계산했고 판정에는 쓰지 않는다.

| 모델       | 프로젝트               | 실행당 평균 비용(baseline / skill / placebo) | 평균 턴(baseline / skill / placebo) |
| ---------- | ---------------------- | -------------------------------------------- | ----------------------------------- |
| Sonnet 5.5 | recharts               | $0.092 / $0.097 / $0.097                     | 7.3 / 6.9 / 6.9                     |
| Sonnet 5.5 | swagger-typescript-api | $0.210 / $0.208 / $0.216                     | 15.9 / 15.1 / 15.6                  |
| Haiku 5.5  | recharts               | $0.034 / $0.035 / $0.059                     | 27.5 / 24.6 / 63.6                  |
| Haiku 5.5  | swagger-typescript-api | $0.046 / $0.046 / $0.085                     | 31.6 / 33.8 / 68.3                  |

96회 전체 비용은 $9.80이다. Haiku 5.5에서는 placebo 실행의 턴과 비용이 baseline의 두 배쯤 나왔다. 공식 Skill에서는 이런 증가가 없었다.

## 5. 검출력 예측과 실제

사전 등록 때 스모크 실행 24회의 분산으로 검출력을 모의실험했다. swagger-typescript-api · Haiku 5.5는 스모크에서 한도 실행(0점) 1회가 나와 분산이 커서, K = 8에서 동등 판정 검출력이 0.000으로 예측됐다. 본 실험에서는 이 셀에 한도 실행이 없었고 점수 표준편차가 1.2pp에 그쳐 동등으로 판정됐다. 예측이 비관적이었던 이유는 스모크의 한도 실행 1회였다.

## 6. 사전 등록 이후 바꾼 것

| 커밋                | 내용                                                                                                                                                                                                                                              | 판정 영향 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `b857ead`           | `vitest.config.ts` 추가. 저장소 자체 테스트가 숨김 검사 파일까지 실행하던 CI 문제를 고쳤다.                                                                                                                                                       | 없음      |
| 이 결과와 같은 커밋 | 보고서 6·7절 집계 수정. 비용·시간·턴 함수가 파일 단위 설계의 `meta.turns`만 읽어 빈 값이 나왔고, "Skill 로드"가 Skill 목록이 비어 있지 않은지만 봐서 baseline도 100%로 나왔다. `meta.turn`도 읽고 `es-toolkit:migrate` 포함 여부를 세도록 고쳤다. | 없음      |

두 변경 모두 실행기, 채점기, 판정 계산(1~5절)을 건드리지 않았다.

## 7. 이 결과로 말할 수 있는 것과 없는 것

말할 수 있는 것:

- 이 두 프로젝트에서 Sonnet 5.5와 Haiku 5.5는 Skill 없이도 lodash를 빠짐없이 걷어 내고 기존 동작을 97% 이상 유지했다.
- 공식 Skill은 그 점수를 15pp 넘게 올리지도 내리지도 않았다.

말할 수 없는 것:

- Skill이 쓸모없다는 결론. ±15pp보다 작은 차이는 이 설계로 구분하지 못한다. 모델이 compat 전략을 모르는 경우(이전 세대 모델, 사내 래퍼가 많은 코드베이스)는 측정하지 않았다.
- 다른 프로젝트로의 일반화. 두 프로젝트 모두 lodash를 유틸리티 위주로 쓰고, 체이닝은 swagger-typescript-api 한 곳뿐이다.
- 자연어 요청에서 Skill이 자동으로 불리는지. 이 실험은 슬래시 명령으로 호출을 강제했다.
