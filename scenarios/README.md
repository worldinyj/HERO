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


## 실사건 공개 `incidentDebrief`

경쟁 시나리오는 배포 전에 사용자에게 공개할 익명화 학습정보를 포함해야 합니다.
초안 저장은 가능하지만 `published` 전환 시 `incidentDebrief`가 없으면 서버가 배포를 차단합니다.
`s00_tutorial`은 예외입니다.

```json
{
  "incidentDebrief": {
    "caseType": "작업 대상 식별 오류",
    "overview": "실제 사건을 교육 목적에 맞게 익명화·일반화한 개요",
    "rootCauses": [
      "절차와 현장 식별 조건을 연결하는 방어막이 충분히 작동하지 않았다."
    ],
    "contributingFactors": [
      "시간압박",
      "유사한 설비 표식",
      "동료확인 미활용"
    ],
    "lessons": [
      {
        "title": "확신이 없으면 멈추고 다시 확인한다.",
        "detail": "작업 대상이 불명확하면 진행보다 확인을 우선하고 독립적인 확인 방어막을 사용한다.",
        "toolId": "stop_when_unsure"
      }
    ]
  }
}
```

공개용 `incidentDebrief`에는 **OPIS 사건번호, 발전소명, 호기, 고유 설비 Tag, 세부 운전값, 개인식별정보를 넣지 않습니다.**
원문 보고서·근거 사건 ID와의 연결은 R2의 비공개 `opis_reports` / `scenario_sources` 메타데이터에서 관리합니다.


## 조사·초안 디렉터리

- `research/`: 사건 후보 선별, HF 분석, 익명화·Just Culture 검토 기록
- `drafts/`: 아직 원문확인/사람승인이 끝나지 않은 시나리오 JSON
- `data/`: 실제 앱·기본 CI가 사용하는 승인된 시나리오 JSON

현재 S01/S02 조사 초안은 `drafts/`에 있으며, **요구된 공식 원문/OPIS 대조와 HF 사람 승인 전에는 `data/`로 이동하거나 published 상태로 전환하지 않습니다.**

Draft 검증:

```bash
pnpm validate:scenario scenarios/drafts
pnpm simulate:scenario -- --scenario=scenarios/drafts/S01_time_pressure_v1.json
pnpm simulate:scenario -- --scenario=scenarios/drafts/S02_equipment_identity_v1.json
```

CI는 draft의 스키마·그래프 오류와 시뮬레이터 error를 차단합니다. balance warning은 연구 단계에서 허용하지만 `T3_HF_REVIEW_CHECKLIST_V1.md`에 검토/예외 사유를 남겨야 합니다.
