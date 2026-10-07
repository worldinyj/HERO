# S03 AI Pre-Review V1 — Human Review 지원용

> 대상: `s03_procedure_reality_gap`  
> 기준일: 2026-10-07  
> 상태: **ADVISORY PASS — HUMAN APPROVAL REQUIRED**  
> 이 문서는 자동/AI 사전검토이며 `promotion-status.json`의 human approval을 대신하지 않는다.

## 1. 검토 범위

다음 네 범위를 사람 검토 전에 사전 점검했다.

1. HF/HU Tool 표현 정합성
2. Just Culture 및 개인책임 과도집중 여부
3. 익명화·운전정보 과노출 여부
4. 공식 조사결과와 HERO 교육적 재구성의 경계

기술적 graph/schema/path/balance 검증은 기존 CI 결과를 따른다.

## 2. 사전 판정

| 항목 | AI 사전판정 | 근거/메모 |
|---|---|---|
| 공식 사건 사실관계 | PASS | 2026-09-04 원안위 보도자료의 설정방향 입력 오류, 자동정지, 재확인 절차·시스템 보강, 교육 조치를 사실기반 축으로 사용 |
| source/rights | PASS | `source-evidence.json`에서 source/rights verdict complete. 정책브리핑 텍스트 공공누리 제1유형 확인 |
| 실제 발전소/호기 노출 | PASS | 공개 draft에는 실제 발전소/호기명 없음 |
| 고유 설비명/Tag 노출 | PASS | “설비 반응의 상한을 정하는 설정” 수준으로 일반화 |
| 실제 설정값/시험출력 노출 | PASS | 실제 설정값·출력값·시각·운전화면 재현 없음 |
| 실제 운전절차 재현 위험 | PASS WITH HUMAN CONFIRMATION | 단계는 교육용 의사결정 구조로 일반화되어 있으나 운전/HF 검토자가 실제 절차를 역추론할 수 없는지 최종 확인 필요 |
| 개인 단일원인 프레이밍 | PASS | 입력 오류 사실은 인정하되 절차·시스템·재확인·팀 방어막으로 학습을 확장 |
| Questioning Attitude | PASS | 절차 무시가 아니라 절차 전제와 현재 상태의 불일치 확인으로 표현 |
| Peer Check | PASS AFTER WORDING REFINEMENT | “독립적으로 확인” 표현을 제거해 Independent Verification과의 혼동 가능성을 낮춤 |
| Three-way Communication | PASS AFTER WORDING REFINEMENT | draft에 명시적 Three-way Communication Tool이 없어 HF Brief를 “명확한 팀 커뮤니케이션”으로 정리 |
| Place Keeping | HUMAN CONFIRMATION | 상태전환 중 현재 단계·입력 목적 유지라는 교육적 용도는 타당해 보이나 실제 적용 적절성 확인 필요 |
| Stop When Unsure | PASS WITH HUMAN CONFIRMATION | 예상과 반대 추세에서 추가 입력보다 중지·안정·확인을 우선하는 방어행동으로 표현 |
| PSF/Hazard Index | PASS | HF Brief에서 게임용 PSF가 공식 원인분류가 아님을 명시하며 UI에서도 실제 HRA/HEP로 제시하지 않음 |
| 사건 디브리프 경계 | PASS WITH UI REFINEMENT | UI에서 공식자료 기반 사건개요와 “방어막 관점 원인 분석”을 구분하는 별도 PR과 함께 검토 권장 |

## 3. 이번 사전검토에서 수정한 표현

### Peer Check

수정 전에는 “다른 사람과 독립적으로 확인”, “동료가 별도로 확인” 문구가 있어 **Independent Verification**과 혼동될 여지가 있었다.

수정 후:

- “중요 설정의 방향은 동료와 함께 확인한다.”
- “입력 전에 설정 방향과 기대되는 설비반응을 동료와 함께 확인해 조작 의도와 현재 상태가 일치하는지 확인한다.”
- 선택지: “입력 전에 동료와 설정 방향과 기대 반응이 일치하는지 확인한다.”

### Communication

HF Brief의 “Peer Check / Three-way Communication”을 “Peer Check와 명확한 팀 커뮤니케이션”으로 수정했다.

이유:

- 현재 draft는 Three-way Communication의 정식 sender-receiver-confirm 구조를 독립 HU Tool로 구현하지 않는다.
- 구현되지 않은 특정 Tool을 사용했다고 과장하지 않고 실제 시나리오 행동 수준에 맞춘다.

## 4. 사람 검토자가 최종 확인할 항목

- [ ] 실제 운전/HF 관점에서 Peer Check·Place Keeping·Stop When Unsure 적용이 자연스럽다.
- [ ] 게임의 상태전환·설정방향 묘사만으로 실제 절차/화면/고유 설비를 역추론하기 어렵다.
- [ ] 사건 개요의 공식 사실과 HERO의 시스템적 학습 분석이 명확히 구분된다.
- [ ] `incidentDebrief.rootCauses` 문구가 규제기관 공식 근본원인 판정으로 오해되지 않는다.
- [ ] near_miss/event가 낮은 비율인 현재 밸런스가 교육적으로 허용된다.
- [ ] source attribution이 공개 화면 또는 관련 정보 화면에서 충분히 표시된다.
- [ ] 최종 공개문안이 개인의 실수보다 방어막·절차·시스템 개선을 중심에 둔다.

## 5. 사람 승인 이후

사람 검토 완료 전에는 상태를 변경하지 않는다.

승인 후에만:

```bash
pnpm promote:scenario -- \
  --scenario=s03_procedure_reality_gap \
  --approved-by="검토자 성명 또는 공식 역할" \
  --approved-at=YYYY-MM-DD \
  --confirm-hf \
  --confirm-anonymization \
  --confirm-debrief \
  --apply
```

이후 CI의 source-evidence / promotion / schema / path / balance / E2E / DB 정책 게이트를 모두 통과시킨다.
