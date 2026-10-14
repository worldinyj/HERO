# HERO Human Review Packet — 1장 · 오늘 오전까지 끝내야 합니다

> **사람 검토용 패킷 / 자동 승인 문서가 아님**
>
> Scenario ID: `s01_time_pressure`
>
> Version: `4`
>
> Source file: `scenarios/drafts/S01_time_pressure_v1.json`
>
> Review content SHA-256: `3d9c2474a478f1464b6f6f01cc9ee1a320b0a159a4f830d59bcb484d458387dc`

## 1. 현재 승격 상태

| 항목 | 값 |
|---|---|
| promotion status | **SOURCE_HOLD** |
| sourceRightsComplete | `true` |
| source verdict | `complete` |
| rights verdict | `complete` |
| HF review | `false` |
| anonymization review | `false` |
| human review | `pending` |
| approved content SHA-256 | `not approved` |

### 현재 blocker

- Cause/barrier/corrective-action traceability for the current content
- HF/anonymization/current-content human review

## 2. 시나리오 기본정보

| 항목 | 값 |
|---|---|
| 제목 | 1장 · 오늘 오전까지 끝내야 합니다 |
| 기본 관점 | `worker` |
| 대상 직무 | sro, ro, field_operator, supervisor, worker |
| 예상 소요 | 약 8분 |
| 지급 카드 | prejob_briefing, place_keeping, three_way_communication, stop_when_unsure |
| incidentDebrief | 있음 |

> 검토자는 **위 SHA-256과 일치하는 JSON**을 기준으로 검토해야 한다. 승인 이후 JSON이 변경되면 기존 승인은 자동 승계되지 않는다.

## 3. 공식 근거·권리

| 기관 | source class | 범위 | 용도 | 권리 상태 | URL |
|---|---|---|---|---|---|
| IAEA | official_primary | 사건 직접근거 | event_identity, event_facts | not_used_for_reproduction | https://www-news.iaea.org/ErfView.aspx?mId=c4d6b9a1-1f60-4bf3-b333-bb5485fa55e9 |
| 한국수력원자력 | official_primary | 사건 직접근거 | historical_research_locator_only | not_used_for_reproduction | https://www.khnp.co.kr/main/selectBbsNttView.do?bbsNo=67&key=2288&nttNo=22297 |
| 원자력안전위원회 | official_primary | 사건 직접근거 | event_identity, ines_classification | not_used_for_reproduction | https://ourplan.nssc.go.kr/boardDownload.es?bid=0004&list_no=837&seq=1 |
| 원자력안전위원회/원자력안전정보공개센터 | official_locator | 탐색/보조 | direct_record_locator | not_applicable | https://nsic.nssc.go.kr/information/reguDataActive.do?nsicDtaTyCode=nppAccient |
| 원자력안전위원회 | official_primary | 사건 직접근거 | event_investigation, electrical_system_safety_review, corrective_action_context | not_used_for_reproduction | https://www.nssc.go.kr/ko/cms/FR_BBS_CON/BoardView.do?BBS_SEQ=3596&BOARD_SEQ=14&CONTENTS_NO=1&MENU_ID=170&SITE_NO=2 |
| 행정안전부 안전모아 / 원자력안전위원회 제공정보 | official_locator | 탐색/보조 | direct_record_locator, opis_backed_accident_list | not_applicable | https://safewatch.safemap.go.kr/contact/selectNsopSafetyChck.do |
| 원자력안전정보공개센터 / KINS 사건조사 | official_primary | 사건 직접근거 | event_identity, investigation_result, corrective_actions | not_used_for_reproduction | https://nsic.nssc.go.kr/information/reguDataActive.do?nsicDtaTyCode=nppAccient |
| 한국수력원자력 | official_primary | 사건 직접근거 | mission_context, leadership_safety_culture_context | verified · 공공누리 제1유형 (이 보도자료 본문에 한정; 기존 최종보고서 첨부에 상속하지 않음) | https://www.khnp.co.kr/main/selectBbsNttView.do?key=2289&bbsNo=71&nttNo=24384 |

### 아직 부족한 근거

- 없음

## 4. 자동 기술검증 스냅샷

| 항목 | 결과 |
|---|---|
| Schema parse | PASS |
| Path exploration | COMPLETE |
| explored states | 12,511 |
| terminal paths | 7,176 |
| HP min / mean / max | 181 / 235.8 / 246 |
| dominant choice warning | 0 |
| ending imbalance warning | 0 |

### 엔딩 분포

| ending | paths | rate |
|---|---:|---:|
| safe_complete | 4204 | 59% |
| safe_stop | 2392 | 33% |
| near_miss | 508 | 7% |
| event | 72 | 1% |

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
- [ ] incidentDebrief의 HERO 원인분류가 조사기관의 공식 원인분류와 명확히 구분되고, 인과사슬·실패방벽·관련 재발방지대책이 근거와 일치한다.
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
- source evidence: `scenarios/research/source-evidence.json`
- promotion manifest: `scenarios/research/promotion-status.json`

## 7. 승인 후 안전한 승격

먼저 preflight에서 현재 SHA-256을 다시 확인한다.

```bash
pnpm promote:scenario -- --scenario=s01_time_pressure
```

각 검토영역의 결과를 current SHA에 기록하고 확인한다.

```bash
pnpm check:human-review-evidence
```

사람 검토 5개 영역이 **동일한 current SHA에 대해 모두 PASS**이고 preflight의 `draftSha256`이 이 문서의 SHA-256과 같을 때만 아래를 실행한다.

```bash
pnpm promote:scenario -- \
  --scenario=s01_time_pressure \
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
