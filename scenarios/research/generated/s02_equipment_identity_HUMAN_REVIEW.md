# HERO Human Review Packet — 2장 · 아마 이 설비가 맞을 겁니다

> **사람 검토용 패킷 / 자동 승인 문서가 아님**
>
> Scenario ID: `s02_equipment_identity`
>
> Version: `4`
>
> Source file: `scenarios/data/S02_equipment_identity_v1.json`
>
> Review content SHA-256: `785f0306628d4f336675d61a94060b461165e3760d6296091694aa748570c808`

## 1. 현재 승격 상태

| 항목 | 값 |
|---|---|
| promotion status | **APPROVED** |
| sourceRightsComplete | `true` |
| source verdict | `complete` |
| rights verdict | `complete` |
| HF review | `true` |
| anonymization review | `true` |
| human review | `approved` |
| approved content SHA-256 | `785f0306628d4f336675d61a94060b461165e3760d6296091694aa748570c808` |

### 현재 blocker

- 없음

## 2. 시나리오 기본정보

| 항목 | 값 |
|---|---|
| 제목 | 2장 · 아마 이 설비가 맞을 겁니다 |
| 기본 관점 | `worker` |
| 대상 직무 | sro, ro, field_operator, supervisor, worker |
| 예상 소요 | 약 8분 |
| 지급 카드 | self_check_star, independent_verification, stop_when_unsure |
| incidentDebrief | 있음 |

> 검토자는 **위 SHA-256과 일치하는 JSON**을 기준으로 검토해야 한다. 승인 이후 JSON이 변경되면 기존 승인은 자동 승계되지 않는다.

## 3. 공식 근거·권리

| 기관 | source class | 범위 | 용도 | 권리 상태 | URL |
|---|---|---|---|---|---|
| 한국수력원자력 한울원자력본부 | official_primary | 사건 직접근거 | event_date, trip_shutdown_chronology | not_used_for_reproduction | https://www.khnp.co.kr/hanul/selectBbsNttList.do?bbsNo=120&integrDeptCode=&key=1761&pageIndex=20&searchCnd=all&searchCtgry=&searchKrwd= |
| 원자력안전위원회 보도자료 / 서울Pn 정부 보도자료 전재 | government_relay | 사건 직접근거 | investigation_result, corrective_actions | not_used_for_reproduction | https://go.seoul.co.kr/news/prnewsView.php?id=337111&page=1306&section=b_sec_1 |
| 원자력안전위원회/원자력안전정보공개센터 | official_locator | 탐색/보조 | direct_record_locator | not_applicable | https://nsic.nssc.go.kr/information/reguDataActive.do?nsicDtaTyCode=nppAccient |
| 대한민국 정책브리핑 | official_locator | 탐색/보조 | policy_briefing_original_locator, same_date_rights_policy_context | not_applicable | https://www.korea.kr/briefing/pressReleaseList.do |
| 행정안전부 안전모아 / 원자력안전위원회 제공정보 | official_locator | 탐색/보조 | direct_record_locator, opis_backed_accident_list | not_applicable | https://safewatch.safemap.go.kr/contact/selectNsopSafetyChck.do |
| 원자력안전정보공개센터 / KINS 사건조사 | official_primary | 사건 직접근거 | event_identity, investigation_result, corrective_actions | not_used_for_reproduction | https://nsic.nssc.go.kr/information/reguDataActive.do?nsicDtaTyCode=nppAccient |
| 원자력안전위원회 | official_primary | 사건 직접근거 | investigation_result_crosscheck, item_rights_comparison | verified · 공공누리 제4유형 (출처표시·상업적 이용금지·변경금지). 이 호스트 원문·이미지·첨부를 게임에 복제·각색하지 않음. | https://www.nssc.go.kr/ko/cms/FR_BBS_CON/BoardView.do?BBS_SEQ=46557&BOARD_SEQ=5&MENU_ID=190&SITE_NO=2 |
| 원자력안전위원회 / 대한민국 정책브리핑 | official_primary | 사건 직접근거 | investigation_result, corrective_actions, text_reuse_basis | verified · 해당 정책브리핑 페이지 텍스트에 한하여 공공누리 제1유형 (출처표시). 사진·이미지·PDF 등 비텍스트 권리는 포함하지 않음. | https://www.korea.kr/briefing/pressReleaseView.do?newsId=156625772 |

### 아직 부족한 근거

- 없음

## 4. 자동 기술검증 스냅샷

| 항목 | 결과 |
|---|---|
| Schema parse | PASS |
| Path exploration | COMPLETE |
| explored states | 11,775 |
| terminal paths | 6,624 |
| HP min / mean / max | 184 / 240.2 / 248 |
| dominant choice warning | 0 |
| ending imbalance warning | 0 |

### 엔딩 분포

| ending | paths | rate |
|---|---:|---:|
| safe_complete | 4296 | 65% |
| safe_stop | 2208 | 33% |
| near_miss | 112 | 2% |
| event | 8 | <1% |

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
pnpm promote:scenario -- --scenario=s02_equipment_identity
```

각 검토영역의 결과를 current SHA에 기록하고 확인한다.

```bash
pnpm check:human-review-evidence
```

사람 검토 5개 영역이 **동일한 current SHA에 대해 모두 PASS**이고 preflight의 `draftSha256`이 이 문서의 SHA-256과 같을 때만 아래를 실행한다.

```bash
pnpm promote:scenario -- \
  --scenario=s02_equipment_identity \
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
