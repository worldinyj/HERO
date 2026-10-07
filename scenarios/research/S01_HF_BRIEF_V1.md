# S01 HF Brief V1 — 일정압박·시험단계 통제·감독

> **상태: SOURCE_HOLD — OFFICIAL IAEA/KHNP SOURCE VERIFIED / OPIS·RIGHTS·HUMAN REVIEW HOLD / publish 금지**  
> 내부 저작용 문서. 공개 게임에는 실제 발전소명·호기·시험설비명·개인/업체 식별정보를 노출하지 않는다.

## 1. 교육 목표

S01 「오늘 오전까지 끝내야 합니다」는 일정압박 자체를 “나쁜 태도”로 가르치는 것이 아니라, 일정·인력·작업계획이 어떻게 현장 의사결정 조건을 바꾸는지 학습한다.

- 작업일정 변경 시 Pre-job Briefing과 위험평가를 다시 해야 하는 이유
- 단계별 hold point와 Place Keeping
- 감독 지시를 송·수신 확인하는 Three-way Communication
- 익숙한 반복작업에서도 overconfidence가 생길 수 있음
- 불확실하거나 조건이 달라졌을 때 Stop When Unsure
- “빨리 끝내라”는 직접 지시가 없어도 인력·다음 작업 일정이 압박으로 인식될 수 있음

## 2. 공식자료에서 확인된 구조

2012년 IAEA 전문가 미션 보고서는 국내 원전 정비기간 중 발생한 전원상실 사건을 분석하면서 다음을 기록했다.

- 보호계통 시험의 일정이 원래 계획에서 앞당겨졌고, 변경이 정비기간 통제조직까지 충분히 전달/승인되지 않아 추가 위험분석이 부족했다.
- 해당 시험 자격을 가진 협력업체 인력의 부족과 다음 작업장 이동 일정 때문에 시간압박이 있었다.
- 감독자가 다음 단계로 진행하지 말라고 지시했지만, 작업자는 다음 단계로 진행했다.
- 절차에는 사전조건, 잠재위험, 오류의 결과가 충분히 설명되지 않았고, 완료 단계별 sign-off 요구가 없었다.
- IAEA는 협력업체 교육·절차·감독이 안전관련 작업의 attention to detail을 충분히 보장하지 못한다고 평가했다.
- 사건은 단일 행동만이 아니라 비정상적인 작업일정/설비 가용성 조합과 시험 중 인적행위가 겹쳐 확대됐다.

출처:
- IAEA NEWS 사건기록 — *Loss of shutdown cooling due to station blackout during refueling outage*: https://www-news.iaea.org/ErfView.aspx?mId=c4d6b9a1-1f60-4bf3-b333-bb5485fa55e9
- KHNP 공개 IAEA 최종보고서 안내: https://www.khnp.co.kr/main/selectBbsNttView.do?bbsNo=67&key=2288&nttNo=22297
- IAEA Expert Mission Report (KHNP 공개 첨부): https://www.khnp.co.kr/main/downloadBbsFile.do?atchmnflNo=7419
- KHNP 저작권정책: https://www.khnp.co.kr/main/contents.do?key=406

> KHNP 일반 저작권정책은 공공누리 표시가 부착된 개별 저작물의 자유이용을 허용한다. 자동 검증에서는 2012년 해당 게시물/첨부 자체의 공공누리 표시를 확정하지 못했으므로, 원문 문장·사진·도표를 공개 게임에 복제하지 않고 사실관계만 독립적으로 일반화한다.

## 3. 공개 시나리오에서 제거할 실제정보

- 발전소명/호기
- 실제 보호계통·변압기·버스 이름
- 실제 시험 번호와 절차서 번호
- 실제 날짜/정비차수
- 협력업체/개인 식별정보
- 실제 전원 구성, 안전계통 가용성, 복구 절차의 구체적 값

게임에서는 “정비 시험의 다음 단계”와 “다른 작업 일정” 수준으로 일반화한다.

## 4. HF 모델

### 잠재조건

- 변경된 작업일정에 대한 위험평가와 승인 흐름의 취약
- 자격 인력 가용성 제약
- 절차의 사전조건/위험/step sign-off 부족
- 협력업체 교육·감독과 현장 HP Tool 적용의 불일치

### 오류유발조건(게임용 PSF 가설)

- `time_pressure`
- `schedule_change`
- `familiarity`
- `coordination_load`

### 핵심 방어막

- Pre-job Briefing
- Place Keeping
- Three-way Communication
- Stop When Unsure
- 일정변경 시 위험평가/승인
- 감독자 hold point

## 5. 결정 구조

### Decision 1 — 일정이 바뀌었을 때

- 변경사항을 반영해 짧게 재브리핑
- 작업경계/가용조건을 문서와 다시 대조
- 기존 브리핑이 있으므로 그대로 진행

### Decision 2 — “다음 단계 진행 금지” 지시를 받은 뒤

- hold point에서 멈추고 조건을 다시 확인
- 지시를 복창해 송·수신 의미를 맞춤
- 익숙한 시험이고 시간이 촉박하므로 다음 단계를 진행

### Hidden Hazard

일정·절차·커뮤니케이션 방어막의 상태와 공통 simulation seed로 판정한다. 위험수치는 사용자에게 표시하지 않는다.

### Recovery

예상하지 못한 반응이 나타난 뒤에도:
- 중지·보고·상태보호
- 팀과 상태를 재확인하고 제한된 복구
- “시험을 끝내면 정리될 것”이라 보고 계속
의 trade-off를 제공한다.

## 6. Just Culture 문구 기준

피해야 할 표현:
- “작업자가 지시를 무시해 사고를 냈다.”
- “숙련자가 방심했다.”

권장 표현:
- “일정 재조정, 자격 인력 제약, 단계통제·절차·감독 방어막과 현장 행동이 겹쳤다.”
- “개인의 선택이 중요하지만, 그 선택을 둘러싼 조건과 방어막도 함께 바꿔야 재발을 줄일 수 있다.”

## 7. 2026-10-07 추가 공식 검증

원자력안전위원회 공개 원자력안전 통계자료에서 2012년 사건을 다음과 같이 공식 분류한 것을 추가 확인했다.

- 사건명 수준 식별: **고리 1호기 계획예방정지 중 소외전원 상실 및 비상디젤발전기 고장**
- INES: **2등급**
- 원안위 통계는 이 사건을 국내 INES 2등급 사건 4건 중 하나로 명시한다.
- 공식 통계 근거: https://ourplan.nssc.go.kr/boardDownload.es?bid=0004&list_no=837&seq=1
- 최신 통계의 동일 사건 재확인: https://ourplan.nssc.go.kr/boardDownload.es?bid=0004&list_no=838&seq=1

이로써 S01의 **사건 식별과 규제기관 분류는 추가 확정**되었다. 다만 OPIS의 직접 사건 레코드 URL/식별번호를 아직 확보하지 못했으므로 OPIS 매핑 게이트 자체는 닫지 않는다.

### OPIS/NSIC 공개체계 추적 메모

추가 웹 검증에서 과거 OPIS의 사고·고장 정보 공개 목록 엔드포인트가 다음 경로였음을 확인했다.

- 과거 OPIS 사고·고장 정보 공개 목록: `http://opis.kins.re.kr/opis?act=KROCA4600R`
- 당시 공개 설명은 발전소·발생일시·등급 조건으로 검색하고 제목을 눌러 상세정보/PDF를 확인하는 구조였음을 기록한다.
- 같은 공개 설명은 **2012-02-09 고리 1호기 사건을 INES 2 등급 사례로 OPIS에서 조회**한 예를 제시한다.
- 현재 원안위 홈페이지의 “원전 사고고장 현황” 링크는 원자력안전정보공개센터(NSIC)의 사고·고장 공개 화면으로 연결된다:
  - https://nsic.nssc.go.kr/information/reguDataActive.do?nsicDtaTyCode=nppAccient

위 정보는 **공개체계와 검색 위치를 확인하기 위한 보조 locator**이다. 현재 자동 도구에서는 OPIS/NSIC 상세 화면이 직접 열리지 않아 사건별 상세 URL·식별자·PDF를 확보하지 못했으므로 A급 직접 레코드로 승격하지 않는다.

### 원안위 2012 안전점검 자료 추가 확인

2026-10-07 추가 공식 검색에서 원자력안전위원회 제4회 회의자료 페이지에 고리1호기 사건과 직접 연결되는 다음 첨부가 공개되어 있음을 확인했다.

- `(의결제1호 참고자료1) 고리1호기 전력계통 특별안전점검 결과보고서.pdf`
- `(의결제1호 참고자료2) 고리1호기 종합 안전점검결과보고서.pdf`
- `(의결 제1호) 고리1호기 안전점검결과 및 향후조치계획(안).pdf`
- 공식 페이지: https://www.nssc.go.kr/ko/cms/FR_BBS_CON/BoardView.do?BBS_SEQ=3596&BOARD_SEQ=14&CONTENTS_NO=1&MENU_ID=170&SITE_NO=2

이는 OPIS locator와 별개로, **규제기관이 사건 후 수행한 전력계통·종합 안전점검의 사건 직접 1차 자료**를 추가 확보한 것이다. 다만 HERO는 이 PDF의 문장·도표·설비세부를 공개 게임에 복제하지 않고 사건 구조 확인용으로만 사용한다.

이 추가 근거로 S01의 사건 사실성은 더 강해졌지만, 기존 승격 조건인 **OPIS/NSIC 사건별 상세 식별자**와 **2012 KHNP 게시물/첨부의 개별 이용표시**, 사람 HF/익명화 검토는 아직 남아 있으므로 `SOURCE_HOLD`를 유지한다.

## 8. 승격 조건

- [x] IAEA/KHNP 공개 원문 확인
- [ ] OPIS 직접 사건 레코드 URL/식별번호 확보 (원안위 공식 통계의 사건명·INES 2 매핑은 확인 완료)
- [ ] 해당 2012 KHNP 게시물/첨부의 개별 이용표시 확인
- [ ] HF 전문가 검토
- [ ] 익명화/운전정보 과노출 검토
- [x] draft JSON validate PASS
- [x] 전 경로 시뮬레이션 COMPLETE
- [x] 4종 엔딩 reachable
- [x] 정답편향 경고 0
- [x] ending imbalance 경고 0

상세 승격 판정: [T3_SOURCE_RIGHTS_REVIEW_V1.md](T3_SOURCE_RIGHTS_REVIEW_V1.md) 참조.
