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
- 절차 재확인·운전시스템 반영·사례교육 재발방지책 확인
- 정책브리핑 텍스트 공공누리 제1유형 확인

기술결과:
- JSON/graph PASS
- 전 경로 COMPLETE
- 6,624 terminal paths
- safe_complete 65% / safe_stop 33% / near_miss 1% / event <1%
- dominant choice warning 0
- ending imbalance warning 0

사람 검토:
- [ ] 설정값/시험출력/구체 기기명 등 실제 운전정보를 과도하게 노출하지 않는다.
- [ ] 입력 오류만 강조하지 않고 절차·시스템 재확인 방어막을 함께 보여준다.
- [ ] Questioning Attitude를 “절차를 무시하는 태도”로 오해하게 하지 않는다.
- [ ] Peer Check·Place Keeping·Stop When Unsure의 역할이 사실과 교육목적에 맞는다.
- [ ] 게임용 PSF/Hazard Index를 공식 원인분류·HEP처럼 표현하지 않는다.
- [ ] incidentDebrief가 발전소/호기 식별 없이 사건 교훈을 전달한다.
- [ ] 공개문안의 출처표시 위치를 확정한다.

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
4. JSON을 `scenarios/drafts/`에서 `scenarios/data/`로 승격한다.
5. CI promotion guard + schema/graph + path simulation을 통과시킨다.
6. 관리자에서 scenario version을 업로드하고 review → published 전환한다.

CI는 사람승인 정보가 없는 경쟁 JSON이 `scenarios/data/`에 들어오면 실패한다.
