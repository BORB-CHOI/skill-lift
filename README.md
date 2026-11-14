# skill-lift

LLM 에이전트에게 Agent Skill(`SKILL.md`)을 줬을 때 **Skill이 내세운 목적을 실제로 더 잘 달성하는지**를 판정하는 평가 도구다. 평가 대상은 토스가 [toss/es-toolkit](https://github.com/toss/es-toolkit)에 공식 배포한 Claude Code Skill `es-toolkit:migrate`(lodash 코드를 es-toolkit으로 전환하도록 안내하는 Skill)다.

> 이 문서에서 **Skill**은 toss/es-toolkit 저장소의 Claude Code Skill `es-toolkit:migrate`(`es-toolkit-plugin/skills/migrate/SKILL.md`)를, **es-toolkit**은 같은 저장소의 라이브러리를 가리킨다.

## 결과

<!-- RESULTS -->

본 실험 결과는 [docs/results.md](docs/results.md)에 있다.

## 무엇을 판정하나

Skill을 쓰는 상황은 **이미 lodash를 쓰는 기존 프로젝트를 es-toolkit으로 옮기는 일**이다. 근거는 세 곳이다.

- `SKILL.md`의 description
- 플러그인 README의 사용 예
- es-toolkit 문서의 compat 소개

그래서 판정 질문은 다음과 같다.

> 실제 오픈소스 프로젝트 전체를 lodash에서 es-toolkit으로 옮기라고 시켰을 때, 공식 Skill을 넣은 실행이 Skill 없는 실행보다(그리고 내용 없는 가짜 Skill을 넣은 실행보다) lodash를 빠짐없이 바꾸고 기존 동작을 더 잘 유지하는가.

판정은 프로젝트 × 모델마다 "높다 / 낮다 / ±15pp 안에서 같다 / 판정할 수 없다" 가운데 하나다.

## 어떻게 판정하나

| 구성          | 내용                                                                                                                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 시험 프로젝트 | lodash → es-toolkit 전환 PR을 실제로 머지한 [recharts](https://github.com/recharts/recharts)(#5811)와 [swagger-typescript-api](https://github.com/acacode/swagger-typescript-api)(#1562)를 PR 직전 커밋으로 되돌려 쓴다. |
| 조건          | Skill 없음(baseline), 공식 Skill, placebo(같은 분량의 일반론으로 바꾼 가짜 Skill). 같은 지시문, 같은 모델, 같은 권한이고 슬래시 명령으로 Skill 호출을 강제한다.                                                          |
| 모델          | Claude Sonnet 5.5, Claude Haiku 5.5                                                                                                                                                                                      |
| 실행          | `claude -p`를 사용자 설정과 격리해 실행한다. 네트워크는 프록시로 막고, 프록시를 우회할 수 있는 시도와 정답 자료(원본 저장소, 사람의 PR) 접근은 실행 기록에서 찾아 오염으로 뺀다.                                         |
| 채점          | 통과한 항목의 비율이다. lodash 제거, 의존성 정리, es-toolkit 선언, 타입 검사·빌드, 기존 테스트, 숨김 검사(recharts 32개, swagger-typescript-api 35개)를 본다.                                                            |
| 숨김 검사     | lodash 호출 지점마다 lodash와 대체 구현의 동작이 갈리는 입력을 넣고, 원래 커밋의 결과와 비교한다. 에이전트는 이 검사를 볼 수 없다.                                                                                       |
| 통계          | 실행 단위 두 표본 순열 검정, ±15pp 동등 검정(TOST), 순열 검정을 뒤집은 95% 구간, 8개 판정에 Holm 보정. 반복 횟수는 스모크 실행의 분산으로 모의실험해 정한다.                                                             |
| 사전 등록     | 실행 전에 설계, 채점 항목, 숨김 검사 해시, 판정 규칙을 git 태그로 고정한다.                                                                                                                                              |

설계와 근거는 [docs/design.md](docs/design.md)에 있다.

### 채점기 검증

채점기가 무엇을 잡는지 AI 없이 먼저 확인했다(`pnpm eval:gate`).

| 제출                        | recharts                      | swagger-typescript-api                                       |
| --------------------------- | ----------------------------- | ------------------------------------------------------------ |
| 아무것도 바꾸지 않음        | lodash 항목만 실패            | lodash 항목만 실패                                           |
| 사람이 머지한 전환 PR       | `throttle` 동작 차이 1개 실패 | 깊은 병합 → 얕은 복사 4개, 공개 타입에 남은 lodash 참조 실패 |
| 전부 compat으로 기계적 치환 | `throttle` 1개 실패           | 기존 테스트와 숨김 검사 다수 실패                            |

사람이 머지한 PR도 기존 테스트로는 잡히지 않은 동작 변경을 담고 있었고, 숨김 검사가 그 지점을 잡는다.

## 이 설계에 이르기까지

| 시도      | 과제                              | 결과와 원인                                                                                                                    |
| --------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| v1, v2    | 합성 파일 16개, 통과/실패         | 판정 불가. 대조 조건이 이미 75~100%를 통과했다. 원본 lodash와 직접 비교할 수 있어 Skill 내용이 결과를 바꾸지 못했다.           |
| v3 파일럿 | 합성 파일 22개, Skill 판단표 채점 | Skill 없는 Sonnet이 전환 정확성 96%를 달성해 Skill이 높일 여지가 없었다. 실제 사용 상황(프로젝트 전체 전환)과도 거리가 있었다. |
| 현재      | 실제 프로젝트 2개 전체 전환       | 위 결과                                                                                                                        |

이전 시도의 코드와 결과는 git 기록과 태그(`prereg-migrate-v1`, `prereg-migrate-v2.1`)에 남아 있다.

## 사용법

필요한 것: Node.js 20 이상, pnpm, Claude Code CLI(로그인된 상태), Windows 또는 Linux.

```bash
pnpm install
git submodule update --init
pnpm eval:setup              # 빈 MCP 설정 생성
pnpm eval:prepare-arms       # 공식 Skill과 placebo 플러그인 폴더 생성
pnpm eval:prepare-fixtures   # 시험 프로젝트 fixture와 원래 커밋의 테스트 결과
pnpm eval:probe-network      # 네트워크 차단 확인
pnpm eval:gate               # 채점기 관문
```

```bash
pnpm eval:run --label <이름> --mode full --projects recharts,swagger-typescript-api \
  --arms baseline,skill,placebo --repeats <K> --max-turns <N> --timeout-min <분> \
  --model claude-sonnet-5-5 --concurrency 2
pnpm eval:rescan results/es-toolkit-migrate-project/<이름>
pnpm eval:grade results/es-toolkit-migrate-project/<이름>
pnpm eval:power <스모크 이름>
pnpm eval:score <이름> <사전 등록 파일>
```

## 개발

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

CI는 ubuntu·windows × Node 20·24에서 위 네 단계를 실행한다. 테스트는 LLM을 호출하지 않는다.

## 구조

```
src/
  runner/      claude -p 실행, 실행 기록 해석, 작업 폴더, 네트워크·정답 접근 검사, 실행 계획
  graders/     프로젝트 채점(패치 적용, lodash 검사, 테스트·숨김 검사 실행)
  stats/       순열 검정, 동등 검정, 구간, Holm, 판정·결론, 검출력 모의실험
scripts/       fixture 준비, 실행, 재검사, 채점, 검출력, 사전 등록, 보고서
suites/es-toolkit/
  projects/<프로젝트>/hidden/   숨김 검사와 manifest
  projects/<프로젝트>/grading.json
  migrate/arms/placebo.md       placebo 본문
vendor/es-toolkit               평가 대상 Skill(서브모듈, 고정 커밋)
docs/                           설계, 결과
```

## 한계

- 프로젝트 두 개와 모델 두 개에 대한 판정이다. 다른 프로젝트로 일반화하지 않는다.
- 숨김 검사는 동작이 갈리는 지점을 사람이 골라 만든 것이라 모든 차이를 잡지는 못한다.
- 슬래시 명령으로 Skill 호출을 강제했다. 자연어 요청에서 Skill이 자동으로 불리는지는 측정하지 않았다.
- Skill이 내는 설명(기능 비교표, 문서 링크)의 품질은 채점하지 않는다.
- 사람이 직접 감사하지 않았다.

## 라이선스

MIT. `vendor/es-toolkit`은 toss/es-toolkit의 라이선스(MIT)를 따른다. `suites/es-toolkit/migrate/arms/placebo.md`는 평가용이며 toss/es-toolkit의 공식 Skill이 아니다.
