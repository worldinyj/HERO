# HERO T3 Human Review Packet V1

> 대상: S01~S03 경쟁 시나리오 초안  
> 기준일: 2026-10-07  
> 자동판정은 사람승인을 대신하지 않는다.

## 검토 방법

각 시나리오에 대해 아래 항목을 사람이 직접 확인하고 승인자/일자/의견을 기록한다. 승인 전에는 `promotion-status.json`의 상태를 `approved`로 바꾸지 않는다.

---

## S01 — 오늘 오전까지 끝내야 합니다

현재 상태: **SOURCE_HOLD**

기술결과:
- JSON/graph PASS
- 전 경로 COMPLETE
- 7,176 terminal paths
- safe_complete 59% / safe_stop 33% / near_miss 7% / event 1%
- dominant choice warning 0
- ending imbalance warning 0

남은 외부 근거:
- OPIS 사건번호/원문 매핑
- 2012 KHNP 게시물/첨부의 개별 이용표시 확인

사람 검토:
- [ ] 일정압박을 개인의 성격/태도 문제로 표현하지 않는다.
- [ ] 일정변경·자격인력·절차·감독 방어막을 함께 보여준다.
- [ ] 실제 발전소/호기/전원구성/시험번호를 역추적 가능한 수준으로 노출하지 않는다.
- [ ] 실제 복구절차를 재현할 수 있는 상세값이 없다.
- [ ] safe stop을 실패로 묘사하지 않는다.
- [ ] incidentDebrief 문안이 원문 문장을 복제하지 않는다.

승인자: ____________________  
검토일: ____________________  
결론: [ ] 승인  [ ] 수정 후 재검토  [ ] 보류  
의견:

---

## S02 — 아마 이 설비가 맞을 겁니다

현재 상태: **SOURCE_HOLD**

기술결과:
- JSON/graph PASS
- 전 경로 COMPLETE
- 6,624 terminal paths
- safe_complete 65% / safe_stop 33% / near_miss 2% / event <1%
- dominant choice warning 0
- ending imbalance warning 0

남은 외부 근거:
- 2024-04-17 원안위/NSSC 직접 원문 또는 정책브리핑 공식 원문 URL
- 공식 텍스트 이용조건
- OPIS 상세원문

사람 검토:
- [ ] “버튼을 잘못 누른 사람”을 단일 원인으로 만들지 않는다.
- [ ] 잠재 회로상태와 대상 식별·확인 방어막을 함께 다룬다.
- [ ] 실제 패널 형상·색상·회로번호·Tag를 추정해 재현하지 않는다.
- [ ] 공식자료에 없는 감독자 위치/인원구성을 사실처럼 쓰지 않는다.
- [ ] near_miss/event가 낮은 비율인 것이 교육적으로 적절한지 확인한다.
- [ ] Self Check / Peer Check / Independent Verification이 하나의 “정답 버튼”으로 고정되지 않는다.

승인자: ____________________  
검토일: ____________________  
결론: [ ] 승인  [ ] 수정 후 재검토  [ ] 보류  
의견:

---

## S03 — 절차와 실제 상황이 조금 다릅니다

현재 상태: **REVIEW_READY**

공식/권리:
- 원안위 2026-09-04 공식 조사결과 확인
- 사용자 제공 KINS 사건조사보고서 제2026-03호를 내부 HF 원인분석 기준자료로 추가
- 절차 재확인·운전시스템 반영·사례교육·미예정 운전행위 사전점검 등 재발방지책 확인
- 정책브리핑 텍스트 공공누리 제1유형 확인
- KINS PDF 자체는 공개 게임 자산으로 복제하지 않고 사실·원인구조 검토용으로만 사용

기술결과:
- JSON/graph PASS
- 전 경로 COMPLETE
- 6,624 terminal paths
- safe_complete 65% / safe_stop 33% / near_miss 1% / event <1%
- dominant choice warning 0
- ending imbalance warning 0

사람 검토:
- [ ] 설정값/시험출력/구체 기기명 등 실제 운전정보를 과도하게 노출하지 않는다.
- [ ] 직접원인(설정치 입력 오류/물리적 트리거), HERO 근본원인 분류, 기여원인을 명확히 구분한다.
- [ ] 입력 오류만 강조하지 않고 미예정 운전행위 관리·운전모드 mental model·검증/감시 방어막을 함께 보여준다.
- [ ] Questioning Attitude를 “절차를 무시하는 태도”로 오해하게 하지 않는다.
- [ ] Peer Check·Place Keeping·Stop When Unsure의 역할이 사실과 교육목적에 맞는다.
- [ ] 게임용 PSF/Hazard Index를 공식 원인분류·HEP처럼 표현하지 않는다.
- [ ] incidentDebrief가 발전소/호기 식별 없이 사건 교훈을 전달한다.
- [ ] HERO의 Root Cause 분류가 KINS의 공식 표현과 혼동되지 않으며, 보고서가 명시하지 않은 taxonomy를 공식판정처럼 쓰지 않는다.
- [ ] 원자로 자동정지 원인과 사건 후 EOP 수행 중 Recovery HF 이슈를 섞지 않는다.
- [ ] 공식자료 기반 사건 개요와 HERO의 교육적 재구성이 화면에서도 구분된다.
- [ ] 실사건 화면의 공식 출처 링크·발행기관·일자·공공누리 표기가 적절하며, 출처표시와 익명화 목적이 균형을 이룬다.

승인자: ____________________  
검토일: ____________________  
결론: [ ] 승인  [ ] 수정 후 재검토  [ ] 보류  
의견:

---

## 승인 후 저장소 변경 규칙

승인된 시나리오만 다음 순서로 처리한다.

1. `promotion-status.json`에 HF/익명화 검토 완료를 기록한다.
2. `humanReview.status = "approved"`, 승인자, 승인일을 기록한다.
3. `status = "approved"`로 변경한다.
4. JSON을 `scenarios/drafts/`에서 `scenarios/data/`로 승격하고, 승격 도구가 승인 시점의 SHA-256을 `approvedContentSha256`에 기록한다.
5. CI promotion guard가 현재 파일 hash와 승인 hash의 일치를 확인한 뒤 schema/graph + path simulation을 통과시킨다.
6. 관리자에서 scenario version을 업로드하고 review → published 전환한다.

CI는 사람승인 정보가 없는 경쟁 JSON이 `scenarios/data/`에 들어오면 실패한다.


## 승인 후 안전한 승격 명령

사람 검토가 끝나도 파일과 manifest를 직접 수정하지 않는다. 먼저 preflight를 실행한다.

```bash
pnpm promote:scenario -- --scenario=s03_procedure_reality_gap
```

preflight는 다음을 확인한다.

- promotion manifest에 등록된 경쟁 시나리오인지
- `sourceRightsComplete=true`인지
- source 파일이 `scenarios/drafts/` 아래에 있는지
- draft JSON이 ScenarioSchema를 통과하는지
- manifest scenarioId와 JSON id가 같은지
- 현재 검토 대상 JSON의 SHA-256 (`draftSha256`)

실제 승격은 **검토자가 HF·익명화/운전정보 과노출·incidentDebrief를 모두 확인한 뒤**에만 실행한다.

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

`--apply` 실행 시 도구는 승인 기록을 manifest에 쓰고 draft JSON을 `scenarios/data/`로 이동한다. 그러나 이 명령 자체가 검토를 대신하지 않는다. 특히 `sourceRightsComplete=false`인 S01/S02는 사람 승인 플래그를 넣더라도 승격이 거부된다.

승격 후 반드시 다음을 실행한다.

```bash
pnpm check:scenario-promotion
pnpm validate:scenario
pnpm simulate:scenario
pnpm analyze:hp-balance
pnpm check:mvp-readiness
```

최종 커밋/PR은 CI의 promotion/schema/path/balance/E2E/DB 정책 게이트를 모두 통과해야 한다. 승인 후 JSON을 수정하면 `approvedContentSha256` 불일치로 promotion guard가 실패하므로, 콘텐츠 변경이 필요하면 다시 사람검토·재승인을 수행한다.
