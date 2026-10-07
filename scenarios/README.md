# HERO scenarios

- `data/`: 실제 게임에서 사용하는 검증 대상 JSON
- `schema/`: `pnpm schema:scenario`로 생성하는 JSON Schema

검증:

```bash
pnpm validate:scenario
pnpm validate:scenario scenarios/data/S00_tutorial.json
```

JSON Schema 생성:

```bash
pnpm schema:scenario
```

시나리오의 `actionId`는 표시 순서와 독립적인 안정적 식별자이며, 통계·세션 재실행에 사용하므로 배포 후 의미 없이 변경하지 않습니다.


경로 시뮬레이션:

```bash
pnpm simulate:scenario
pnpm simulate:scenario -- --scenario=scenarios/data/S00_tutorial.json
pnpm simulate:scenario -- --json
pnpm simulate:scenario -- --strict
```

시뮬레이터는 실제 엔진 규칙으로 장면 진행, 선택지, 정보확인, HU Tool 카드를 탐색해 엔딩·HP 분포를 계산합니다. 기본 분석은 3개의 고정 simulation seed를 사용하며 첫 시도 기준 점수(리플레이 보너스 제외)를 비교합니다.

- `dominant_choice_bias`: 한 선택지가 다음 선택지보다 평균 HP와 안전엔딩 비율에서 크게 앞서는 경우
- `ending_imbalance`: 한 엔딩이 전체 탐색 경로의 90% 이상을 차지하는 경우
- `*_limit_reached`: 경로/상태/행동 상한에 도달해 전수 탐색이 완료되지 않은 경우
- `--strict`: warning도 실패 코드로 처리해 콘텐츠 승인 전 게이트로 사용할 때 적용

선택 가능한 정보행동·카드의 순서 조합까지 포함하므로 시나리오가 복잡하면 경로 수가 빠르게 증가할 수 있습니다. limit 오류가 발생하면 시나리오 구조를 단순화하거나 분석 상한을 조정해야 합니다.
