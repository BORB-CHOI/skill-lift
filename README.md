# skill-route-eval

LLM 에이전트에게 Agent Skill(`SKILL.md`)을 줬을 때 결과물이 실제로 나아지는지를 대조 실행과 통계 판정으로 측정하는 평가 도구다. 첫 평가 대상은 토스가 [es-toolkit](https://github.com/toss/es-toolkit)에 공식 배포한 Claude Code Skill `es-toolkit:migrate`(lodash 코드를 es-toolkit으로 옮기는 Skill)다.

## 해결하려는 문제

Skill을 만든 사람은 보통 Skill을 적용한 결과만 보고 "잘 된다"고 판단한다. 그 판단에는 세 가지 빈틈이 있다.

1. **Skill 없이도 같은 결과가 나오는지 모른다.** 모델이 원래 잘하는 일이면 Skill의 기여는 0이다.
2. **차이가 우연인지 모른다.** 모델 출력은 실행마다 달라진다. 과제 몇 개, 실행 몇 번의 차이는 변동 범위 안일 수 있다.
3. **채점이 맞는지 모른다.** 채점 기준이 Skill의 권고를 그대로 옮기면 "Skill을 따랐는가"를 측정하게 된다. 채점 입력이 부족하면 틀린 답이 통과한다.

공개된 도구들은 이 가운데 일부만 다룬다. Anthropic의 `skill-creator`와 `claude plugin eval`은 Skill 적용·미적용을 비교하지만 차이를 평균값으로만 보고하고 통계 판정이 없다. 학술 벤치마크(SkillsBench, SWE-Skills-Bench)는 대응 비교와 검정을 쓰지만 특정 Skill을 평가하는 도구로 제공되지 않는다.

이 도구는 다음을 함께 갖춘다.

- 실제 Claude Code(`claude -p`)를 사용자 설정과 격리해 Skill 적용·미적용으로 실행
- 정답을 사람이 적지 않고 후보 조합을 전부 채점해 계산한 기준 해답
- 과제 단위 대응 비교와 정확 검정, 개선·악화·동등·판정 불가의 4가지 판정
- 판정 절차 자체의 검증(반분 재표집, 검출력 곡선)
- 실행 상태 분류(인프라 실패가 통과나 실패로 섞이지 않음)
- 실행 전 공개 사전 등록, 비공개 자료는 해시만 공개
- 네이티브 Windows 지원

설계와 근거는 [docs/methodology.md](docs/methodology.md)에 있다.

## 결과: `es-toolkit:migrate`, Haiku

사전 등록(`prereg-migrate-v1`)에 고정한 조건으로 실행했다. 과제 16개, 대조 조건 과제당 6회, Skill 조건 과제당 3회, 모두 144회.

| 항목                              | 값                |
| --------------------------------- | ----------------- |
| Skill 조건 평균 통과율(요구 충족) | 77.1%             |
| 대조 조건 평균 통과율(앞 3회)     | 70.8%             |
| 차이                              | +6.3pp            |
| 과제 단위 BCa 95% 구간            | [-4.2pp, +16.7pp] |
| 부호 뒤집기 검정 p                | 0.50              |
| 0이 아닌 과제별 차이              | 16개 중 4개       |
| **판정**                          | **판정 불가**     |

- 관측된 방향은 Skill 쪽이 6.3pp 높다. 그러나 두 조건이 갈린 과제가 4개뿐이라 그 차이가 우연인지 구분할 수 없다. 0이 아닌 차이가 4개면 가장 작은 p값이 0.125여서 4개가 모두 같은 방향이어도 유의할 수 없다.
- 동작 보존과 타입 검사(정확성)는 144회 전부 통과했다. 실패는 모두 번들 크기나 자기 코드 조건에서 나왔다. 두 조건은 "동작이 같은 답 가운데 어느 진입점과 어떤 호출 형태를 골랐는가"에서만 갈렸다.
- 판정 절차는 차이 없는 데이터에서 0.3%만 잘못 판정했다(반분 재표집 1,000회). 반면 검출력은 낮다. 이 규모에서는 통과율 약 12pp의 개선을 12%만 잡아낸다. 대조 조건이 16개 중 9개 과제에서 이미 만점이어서 올라갈 여지가 적다.

대조 조건용 변형 Skill 세 개도 과제당 3회씩 실행했다(탐색용, 보정하지 않음).

| 조건                                 | 평균 통과율 | 대조 조건과의 차이 |
| ------------------------------------ | ----------- | ------------------ |
| 공식 Skill                           | 77.1%       | +6.3pp             |
| `placebo`(내용 없는 일반론)          | 77.1%       | +6.3pp             |
| `procedure`("먼저 조회하라" 한 문단) | 77.1%       | +6.3pp             |
| `sabotage`(일부러 틀린 내용)         | 75.0%       | +4.2pp             |

- 공식 Skill과 내용 없는 `placebo`가 같은 점수다. 관측된 +6.3pp가 Skill의 es-toolkit 지식에서 왔다는 근거는 없다.
- 틀린 내용을 넣은 `sabotage`도 결과를 낮추지 못했다. "compat을 쓰지 마라"는 지시에도 48회 중 38회가 compat을 썼다. 작업 폴더에 원본 lodash가 있어서 모델이 원본과 직접 비교해 틀린 지시를 무시했다.

따라서 이 결과는 "Skill이 효과가 없다"는 근거가 아니다. "이 과제 집합과 Haiku에서는 효과를 구분하지 못했고, 이 과제 형식은 모델이 스스로 검증할 수 있어 Skill 효과에 둔감하다"는 결과다. 해로운 Skill을 악화로 잡아내는 양성 대조도 실제 실행에서는 실패했다. 전체 결과는 [docs/results/migrate-haiku-v1.md](docs/results/migrate-haiku-v1.md)에 있다.

## 사용법

필요한 것: Node.js 20 이상, pnpm, Claude Code CLI(로그인된 상태).

```bash
pnpm install
git submodule update --init
pnpm eval:setup            # 과제 의존성 설치, 빈 MCP 설정 생성
pnpm eval:prepare-arms     # 공식 Skill과 변형 Skill의 플러그인 폴더 생성
```

과제를 만들고 검증한다. 비공개 자료는 `sealed/`에 생기고 Git에 올라가지 않는다.

```bash
pnpm eval:build-tasks
pnpm eval:validate-tasks 0.05
```

실행하고 채점한다.

```bash
pnpm eval:run <실행 이름> <모델> <K> <동시 실행 수> primary
pnpm eval:run <실행 이름> <모델> <K> <동시 실행 수> controls
pnpm eval:rescore <실행 이름> 0.05 200 0.1 1
```

`eval:run`은 실행 기록과 산출물만 저장한다. 같은 이름으로 다시 실행하면 끝난 실행은 건너뛰고 인프라 실패만 다시 실행한다. `eval:rescore`는 저장된 산출물만으로 채점과 판정을 다시 계산하고 `results/<실행 이름>/report.md`를 쓴다.

과제를 만들 때 쓰는 도구:

```bash
pnpm eval:probe-functions                                  # 함수별 strict·compat 존재와 동작 차이, 번들 크기
pnpm eval:find-mismatch <과제 폴더> <내보낸 함수> <lodash 함수> strict   # 생성 입력에서 갈리는 사례
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
  runner/      claude -p 실행, 실행 기록 해석, 실행 계획·동시 실행, 상태 분류, 작업 폴더
  graders/     동작 비교, 타입 검사, 번들 크기, migrate 채점과 기준 해답 계산
  reference/   후보 조합 생성
  tasks/       과제 형식, 생성기 기반 입력
  arms/        치환 스크립트 3종
  stats/       대응 비교와 정확 검정, 구간, 판정, 분석 절차 검증
scripts/       과제 생성·검증, arm 준비, 사전 등록, 실행, 재채점
suites/es-toolkit/migrate/
  lib/gen.mjs          입력 범위 생성기
  tasks/               과제 16개(+탈락 3개)의 공개 부분
  arms/                변형 Skill 본문(placebo, procedure, sabotage)
  preregistration.json 사전 등록
vendor/es-toolkit      평가 대상 Skill(서브모듈, 고정 커밋)
docs/                  방법론, 결과
tests/                 단위 테스트
```

## 한계

[docs/methodology.md](docs/methodology.md)의 8절에 정리했다. 주요한 것은 다음과 같다.

- 모델은 Haiku 하나, 과제는 작은 합성 파일 16개다.
- 작성자가 `SKILL.md`를 읽은 뒤 함수 목록을 정했고, 사전 등록 전에 과제를 한 번씩 실행해 봤다.
- 플러그인을 설치만 하고 자연어로 요청했을 때의 효과(Skill 자동 호출)는 측정하지 않았다.
- 사람 감사를 하지 않았다. `recommend`, `guide` Skill은 평가하지 않았다.

## 라이선스

MIT. `vendor/es-toolkit`은 toss/es-toolkit의 라이선스(MIT)를 따른다. `suites/es-toolkit/migrate/arms/`의 변형 Skill은 평가용이며 toss/es-toolkit의 공식 Skill이 아니다.
