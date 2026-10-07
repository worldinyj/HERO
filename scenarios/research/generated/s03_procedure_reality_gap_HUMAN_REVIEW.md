# HERO Human Review Packet — 3장 · 절차와 실제 상황이 조금 다릅니다

> **사람 검토용 패킷 / 자동 승인 문서가 아님**  
> Scenario ID: `s03_procedure_reality_gap`  
> Version: `3`  
> Source file: `scenarios/drafts/S03_procedure_reality_v1.json`  
> Review content SHA-256: `73c40653ee8832be6fa316f3e0b58eb46cdea35361390f6cdde3110b408424f1`

## 1. 현재 승격 상태

| 항목 | 값 |
|---|---|
| promotion status | **REVIEW_READY** |
| sourceRightsComplete | `true` |
| source verdict | `complete` |
| rights verdict | `complete` |
| HF review | `false` |
| anonymization review | `false` |
| human review | `pending` |
| approved content SHA-256 | `not approved` |

### 현재 blocker

- HF review of Direct/Root/Contributing cause classification and cause-to-action traceability
- anonymization/operational-overexposure review
- incidentDebrief final approval for v3 content hash

## 2. 시나리오 기본정보

| 항목 | 값 |
|---|---|
| 제목 | 3장 · 절차와 실제 상황이 조금 다릅니다 |
| 기본 관점 | `ro` |
| 대상 직무 | sro, ro, field_operator, supervisor, worker |
| 예상 소요 | 약 8분 |
| 지급 카드 | questioning_attitude, peer_check, place_keeping, stop_when_unsure |
| incidentDebrief | 있음 |

> 검토자는 **위 SHA-256과 일치하는 JSON**을 기준으로 검토해야 한다. 승인 이후 JSON이 변경되면 기존 승인은 자동 승계되지 않는다.

## 3. 공식 근거·권리

| 기관 | source class | 범위 | 용도 | 권리 상태 | URL |
|---|---|---|---|---|---|
| 원자력안전위원회 / 대한민국 정책브리핑 | official_primary | 사건 직접근거 | investigation_result, corrective_actions, public_text_rights | verified · 공공누리 제1유형(출처표시) — 텍스트 | https://www.korea.kr/briefing/pressReleaseView.do?newsId=156780201 |

### 아직 부족한 근거

- 없음

## 4. 자동 기술검증 스냅샷

| 항목 | 결과 |
|---|---|
| Schema parse | PASS |
| Path exploration | COMPLETE |
| explored states | 11,775 |
| terminal paths | 6,624 |
| HP min / mean / max | 182 / 238.2 / 246 |
| dominant choice warning | 0 |
| ending imbalance warning | 0 |

### 엔딩 분포

| ending | paths | rate |
|---|---:|---:|
| safe_complete | 4296 | 65% |
| safe_stop | 2208 | 33% |
| near_miss | 96 | 1% |
| event | 24 | <1% |

### 자동 경고

- 없음

자동검증은 HF·익명화·운전정보 과노출·출처 해석을 승인하지 않는다.

## 5. 사람 검토 체크리스트

- [ ] 공식 사실, HF 해석, HERO 교육적 재구성이 서로 구분되어 있다.
- [ ] 직접원인·근본원인·기여원인/기여요인이 구분되어 있고, 사람의 마지막 행동을 근본원인으로 끝내지 않는다.
- [ ] Peer Check·Place Keeping·Stop When Unsure 등 HU Tool의 명칭과 적용 맥락이 실제 HF 관점에 맞다.
- [ ] 발전소/호기/설비 Tag/실제 설정값·시험조건·복구절차를 역추적할 수 있는 정보가 과도하게 노출되지 않는다.
- [ ] safe stop을 실패나 소극적 행동으로 묘사하지 않는다.
- [ ] 게임용 PSF/Hazard Index가 규제기관 공식 원인분류·HEP·개인 능력지표처럼 읽히지 않는다.
- [ ] incidentDebrief의 HERO 원인분류가 조사기관의 공식 원인분류와 명확히 구분되고, 인과사슬·실패방어막·관련 재발방지대책이 근거와 일치한다.
- [ ] 공식 출처의 기관·일자·링크·이용조건 표기가 실제 공개 화면과 일치한다.
- [ ] 선택지에 도덕적 정답 단서가 과도하지 않고, 경로/엔딩 분포가 교육목적에 적절하다.
- [ ] 이 SHA-256의 JSON을 직접 검토했으며, 승인 후 내용 변경 시 재검토가 필요함을 이해했다.

### 검토 기록

| 검토 영역 | 검토자/역할 | 결과 | 일자 | 비고 |
|---|---|---|---|---|
| HF 정확성·HU Tool |  | HOLD / PASS |  |  |
| 원자력 운전/정비 맥락 |  | HOLD / PASS |  |  |
| 익명화·운전정보 과노출 |  | HOLD / PASS |  |  |
| 교육·Just Culture |  | HOLD / PASS |  |  |
| incidentDebrief·출처 경계 |  | HOLD / PASS |  |  |
| 최종 콘텐츠 승인 |  | HOLD / PASS |  |  |

최종 결론: [ ] 승인  [ ] 수정 후 재검토  [ ] 보류

의견:

## 6. 보조 검토자료

- 공통 HF 체크리스트: `scenarios/research/T3_HF_REVIEW_CHECKLIST_V1.md`
- 사람 검토 증거 기록 가이드: `scenarios/research/HUMAN_REVIEW_EVIDENCE_GUIDE.md`
- 공통 사람 검토 패킷: `scenarios/research/T3_HUMAN_REVIEW_PACKET_V1.md`
- 시나리오별 AI 사전검토가 있는 경우: `scenarios/research/S03_AI_PRE_REVIEW_V1.md`
- S03 원인-근거-방어막-재발방지대책 추적표: `scenarios/research/S03_CAUSE_TRACEABILITY_MATRIX_V1.md`
- machine-readable cause traceability: `scenarios/research/cause-traceability.json`
- source evidence: `scenarios/research/source-evidence.json`
- promotion manifest: `scenarios/research/promotion-status.json`

## 7. 승인 후 안전한 승격

먼저 preflight에서 현재 SHA-256을 다시 확인한다.

```bash
pnpm promote:scenario -- --scenario=s03_procedure_reality_gap
```

각 검토영역의 결과를 current SHA에 기록하고 확인한다.

```bash
pnpm check:human-review-evidence
```

사람 검토 5개 영역이 **동일한 current SHA에 대해 모두 PASS**이고 preflight의 `draftSha256`이 이 문서의 SHA-256과 같을 때만 아래를 실행한다.

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

승격 후:

```bash
pnpm check:scenario-promotion
pnpm check:source-evidence
pnpm validate:scenario
pnpm simulate:scenario
pnpm analyze:hp-balance
pnpm check:mvp-readiness
```

> 승인 명령은 사람 검토의 **기록 수단**일 뿐 검토 자체를 대신하지 않는다.
