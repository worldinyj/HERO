# S03 v4 추가 AI 사전검토 — 2026-10-13

> 상태: **ADVISORY / HUMAN DECISION REQUIRED**
> 소스 기준: main `c844702ba4f050d7d5ad967cc3740d3408b38b78` (PR #110 문서 병합)
> 검토 대상 SHA-256: `f0560093b22ff77a2b9af30afc45ee575690da51b8882c5a8f9aff3a7cf7ee87`

이번 검토는 S03 JSON·HF 분석·원인 추적표·점수 엔진·실사건 화면을 대조하고 경로를 실행한 AI 사전검토다. 사람 PASS/HOLD 기록을 만들거나 콘텐츠를 수정·승격하지 않았다. 실제 원전 조작의 안전성 또는 정식 HF 검토 승인으로 사용하지 않는다.

## 1. 이번에 확인한 근거와 한계

- `scenarios/drafts/S03_procedure_reality_v1.json`: 실제 version=4, 해시 일치.
- `S03_HF_BRIEF_V1.md`, `S03_CAUSE_TRACEABILITY_MATRIX_V1.md`, `cause-traceability.json`: 원인/방어막/대책과 게임 표현을 대조했다.
- 원안위 2026-09-04 보도자료의 정책브리핑 전재 페이지를 새로 조회했다. [모바일 본문](https://m.korea.kr/briefing/pressReleaseView.do?newsId=156780201&pWise=mSub&pWiseSub=C4), [텍스트 이용표시](https://www.korea.kr/briefing/pressReleaseView.do?newsId=156780201&pWiseMinistry=ministryNews&repCode=C00012&repCodeType=%EC%A0%95%EB%B6%80%EB%B6%98).
- 보도자료는 제한 설정값 입력 오류와 밸브가 닫히는 반응, 관련 절차/시스템 보완과 교육을 설명한다. 텍스트 이용표시는 공공누리 제1유형이다. 상세 원인분류·기여조건을 모두 입증하는 자료는 아니다.
- KINS 제2026-03호 원본 PDF는 현재 복제본에 없다. 해당 PDF의 세부 근거는 기존 내부 분석/추적성 기록을 참조했으며 이번에 원본을 독립적으로 재검증한 것으로 표시하지 않는다.
- 공식 출처 링크가 사건을 식별하므로 공개 시나리오의 고유정보 제거를 사건 자체의 완전한 비식별성으로 해석하지 않는다.

## 2. 실제 경로·점수 측정

[측정 JSON](generated/S03_V4_ADVISORY_MEASUREMENTS_20261013.json)은 다음 명령으로 재현한다. 스크립트는 읽기 전용이며 대상 해시가 달라지면 중단한다.

```bash
node --import tsx scripts/review-s03-advisory.mjs --target=v4
```

전 경로 탐색: **6,015 states / 3,519 terminal paths / COMPLETE / 자동 경고 0**. 엔딩별 경로 수는 safe_complete=1,896, safe_stop=1,503, near_miss=96, event=24다. 이는 기본3개 고정 seed에서 정보행동/카드 순서까지 탐색한 경로 수이며 실제 사건 확률·사용자 행동 분포가 아니다.

비교 조건: 첫 시도·정보행동/카드 미사용·회고 응답과 타임라인 확인 모두 true. 각 경로를 `s03-advisory-0`부터 `s03-advisory-19`까지20개 seed로 실행했다. 아래 결과는 각 경로에서20/20 동일했다.

| 경로 | action ID 순서 | 엔딩 | HP |
|---|---|---|---:|
| 첫 판단에서 필요성 재확인 후 조작하지 않음 | pause_compare_current_state | safe_no_action_end | 227 |
| 팀 공유 후 필요성 재확인·미조작 | share_trend_with_peer → place_keep_and_recheck | safe_no_action_end | 229 |
| 팀 공유·동료확인·조작 후 감시/인계 | share_trend_with_peer → peer_check_setting_direction → monitor_before_handover | safe_complete_end | 235 |
| 팀 공유·동료확인·조작 후 기록/인계 | share_trend_with_peer → peer_check_setting_direction → document_and_handover_trend | safe_complete_end | 236 |
| 예방조치로 간주하고 진행·동료확인·감시/인계 | continue_expected_sequence → peer_check_setting_direction → monitor_before_handover | safe_complete_end | 233 |

이 측정은 점수 차이가 존재함을 확인한다. 점수 오류나 최적 경로를 단정하지 않는다. 후반의 추가 학습행동 지표와 safe_complete/safe_stop 엔딩 기본점수가 함께 작용하므로, 경로별 학습가치의 차이까지 검토해야 한다. 자동 dominant-choice 경고0은 이 교육적 정합성 질문을 해소하지 않는다.

## 3. 전문가가 먼저 판정할 쟁점

| ID / 영역 | 관측·검토 질문 | 제안 방향 (미적용) |
|---|---|---|
| R1 / operations_context·hf_accuracy | 미예정·필수성이 확인되지 않은 조작을 계속한 뒤 정상 반응을 얻는 safe_complete 경로가 있다. 불필요한 조작 회피라는 목적과 ‘안전 완료’ 명칭의 관계가 적절한가? | 완료를 조작 성공과 동일시하지 않도록 제목/회고에 목적·필요성 확인의 경계를 명시할지 판단 |
| R2 / just_culture·hf_accuracy | 미조작227~229점보다 계속 조작 후 확인·인계235~236점이 높다. 사용자가 학습점수 때문에 불필요한 조작 경로를 반복하도록 유도할 위험이 있는가? | 전문가가 경로별 학습목표를 먼저 판단한 후 시나리오 효과 또는 엔딩 정책의 수정 범위를 설계. 점수룰 전역 변경은 별도 검토 |
| R3 / hf_accuracy·incident_debrief | 공식 보도자료의 ‘밸브 닫힘 방향’ 설명과 게임의 ‘입력 방향’ 표현은 관련성이 있다. 그러나 상세 HF 자료가 강조하는 운전상태별 제어 기준값 차이를 사용자가 구분할 수 있는가? | 실제 수치·고유 기기명을 추가하지 않고 ‘현재 모드의 기준값·적용 조건·예상반응을 대조’하는 표현을 병기할지 판단 |
| R4 / anonymization·incident_debrief | 공식 출처 링크를 따라가면 발전소·호기가 드러난다. 화면 내부의 일반화와 출처 추적성의 균형이 검토 의도에 맞는가? | 실제 사건 완전 비식별화를 약속하지 않고 공개 화면의 고유정보 최소화 범위를 명확히 설명 |
| R5 / operations_context·incident_debrief | KINS 원본의 세부 원인/대책은 이번에 독립 재검증하지 못했다. HERO root-cause 분류와 별도확인 방어막 매핑이 원본 범위를 넘지 않는가? | 권한 있는 검토자가 원본 §3.2.2·§3.5 및 추적표를 대조하고 근거 참조를 기록 |

## 4. 원문을 유지하며 준비한 표현 제안

다음은 검토용 대안이며 JSON에 적용하지 않았다.

| 대상 | 대안 |
|---|---|
| `decision_setting_direction.prompt` | 이 추가 조작의 필요성, 현재 운전상태의 기준값과 예상반응을 어떤 근거로 확인하시겠습니까? |
| `peer_check_setting_direction.label` | 동료와 조작 필요성·현재 상태의 기준값·예상반응을 대조한 뒤 진행 여부를 확인한다. |
| `compare_direction_cues.revealText` | 같은 표시값도 현재 운전상태와 적용 기준에 따라 의미가 달라질 수 있습니다. 기준값과 예상반응을 함께 대조해야 합니다. |

문구를 바꾸더라도 조작 필요성을 실제로 확인한 사건 사실을 새로 만들면 안 된다. R1/R2의 경로·학습점수 설계가 먼저 검토되어야 하며, 문구만 바꿔 보완이 완료됐다고 판단하지 않는다.

## 5. 검토 상태와 후속 단위

기존 상태 유지: S03 REVIEW_READY, 사람0/5, 경쟁 승인0/3. 이번 AI 질문을 `human-review-evidence.json`의 HOLD로 대리 기록하지 않는다.

1. 전문가가 R1/R2의 교육적 방향을 먼저 판단하고 R3~R5 및 기존5영역을 검토한다.
2. 보완 결정이면 별도 콘텐츠 개정에서 version·해시·추적성 manifest·패킷·공개 검토 요약을 함께 갱신한다. 현재v4 승인을 새 해시에 자동 승계하지 않는다.
3. 현v4 유지 결정이면 해당 해시로 실제 검토 결과를 작성·가져온다. 판단 근거에 이번 점수 비교의 조건과 한계를 남긴다.
4. 전문가 검토가 진행되는 동안 서버 검색·페이지 처리 같은 독립 개발은 진행할 수 있다. 검토 대기만으로 승인/게시를 먼저 실행하지 않는다.

이번 실행: S03 schema/graph, strict 경로 탐색, 고정해시100개 경로 probe, 생성 패킷 freshness, 사람 검토 evidence 및 원인 추적성 검사 통과. 실제 카카오·실기기·운영DB·원본KINS 재검증 및 새 GitHub Actions 실행은 포함하지 않는다.
