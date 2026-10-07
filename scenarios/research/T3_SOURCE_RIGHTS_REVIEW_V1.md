# HERO T3 Source / Rights / Promotion Review V1

> 기준일: 2026-10-07  
> 상태: **내부 콘텐츠 승격 게이트**  
> 목적: S01~S03 draft가 `scenarios/data/`로 이동하기 전에 공식근거·이용조건·HF 검토·기술검증 상태를 한 곳에서 판정한다.

## 1. 승격 원칙

경쟁 시나리오는 아래 게이트를 모두 통과하기 전에는 `scenarios/data/`로 이동하거나 published 상태로 전환하지 않는다.

1. 사건의 핵심 사실을 공식 또는 동등 수준의 1차 근거로 확인
2. 공개 화면에 쓰는 문안의 출처·이용조건 확인
3. 실제 발전소/호기/고유 설비 Tag/개인정보/세부 운전값 제거
4. 개인의 마지막 행동만 원인으로 귀결하지 않는 HF/Just Culture 검토
5. schema/graph validation PASS
6. 전 경로 시뮬레이션 COMPLETE
7. 4종 엔딩 reachable
8. dominant-choice / ending-imbalance 경고 0 또는 승인된 예외 사유
9. 사람 HF 검토 승인

사건의 **사실 자체**는 저작권 보호대상이 아니지만, 원문 문장·사진·도표를 그대로 재사용하지 않는다. HERO 공개문안은 사실관계를 바탕으로 새로 작성한 익명화·교육용 재구성만 사용한다.

## 2. S01 — 일정압박·시험단계 통제·감독

### 공식근거

확인 완료:

- IAEA NEWS 사건기록: *Loss of shutdown cooling due to station blackout during refueling outage*, event date 2012-02-09, Republic of Korea, KORI-1, INES 2.
  - https://www-news.iaea.org/ErfView.aspx?mId=c4d6b9a1-1f60-4bf3-b333-bb5485fa55e9
- KHNP 공개: *국제원자력기구(IAEA) 고리1호기 전문가 안전점검결과 최종보고서(번역문) 공개*.
  - https://www.khnp.co.kr/main/selectBbsNttView.do?bbsNo=67&key=2288&nttNo=22297
- KHNP 공개 첨부 IAEA 최종보고서.
  - https://www.khnp.co.kr/main/downloadBbsFile.do?atchmnflNo=7419
- KHNP 저작권정책.
  - https://www.khnp.co.kr/main/contents.do?key=406

확인된 구조는 일정 재조정, 위험관리/형상관리, 시험 단계 누락 가능성, 협력사 교육·절차·감독, 전원구성 취약이 함께 작용했다는 점이다.

### 권리/출처 판정

- KHNP 일반 저작권정책은 **공공누리 표시가 붙은 개별 저작물만 자유이용**할 수 있다고 명시한다.
- 현재 자동 검증에서는 2012년 해당 게시물/첨부파일 자체의 공공누리 표시를 확정하지 못했다.
- 따라서 HERO는 해당 원문 문장·도표·사진을 복제하지 않는다.
- 공개 `incidentDebrief`는 독립 작성한 일반화 문안만 사용한다.

### 남은 차단사항

- [ ] OPIS 사건번호/원문 매핑
- [ ] 해당 2012 KHNP 게시물/첨부의 개별 이용표시 확인 또는 필요 시 담당부서 확인
- [ ] HF/익명화/과노출 사람 검토

### 기술 게이트

- [x] JSON validate PASS
- [x] path exploration COMPLETE
- [x] 4종 엔딩 reachable
- [x] dominant choice warning 0
- [x] ending imbalance warning 0

**판정: SOURCE_HOLD — 기술적으로는 준비됐지만 source/rights/human gate가 남음.**

---

## 3. S02 — 작업 대상·조작부 식별 오류

### 사건 식별

확인된 사건:

- 2024-01-02 정기검사 전 국내 원전 자동정지 사건.
- 2024-04-17 원안위가 정기검사 중 임계를 허용하면서 원인조사 및 재발방지대책 검토 결과를 공개한 것으로 확인된다.
- 공개 보도는 여자기 전원 관련 차단기 회로가 잘못된 상태였고, 정비원이 차단기 버튼을 상태표시등으로 오인해 조작한 조건이 결합했다고 일관되게 전한다.
- 회로 상태와 사람의 조작이 함께 작용했다는 점이 HERO의 시스템적 학습 목적과 일치한다.

근거:

- 정부 보도자료 전재 인덱스(서울Pn, 원안위 2024-04-17 보도자료 목록 확인):
  - https://go.seoul.co.kr/news/prnewsList.php?page=2073&section=success_story
- 정부 전재 페이지로 기록된 기존 링크:
  - https://go.seoul.co.kr/news/prnewsView.php?id=337111
- 연합뉴스:
  - https://www.yna.co.kr/view/AKR20240417080200017
- 경향신문:
  - https://www.khan.co.kr/article/202404171408011
- 동아사이언스:
  - https://www.dongascience.com/ko/news/64924

### 권리/출처 판정

- 원안위 보도자료의 존재와 핵심 사실은 교차확인됐다.
- 그러나 자동 검증에서는 **2024-04-17 원안위 원문 페이지의 안정적인 직접 URL과 그 페이지의 공공누리 표시**를 확보하지 못했다.
- 언론기사 문장·사진은 공개 게임 문안에 복제하지 않는다.

### 남은 차단사항

- [ ] 원안위/NSSC 원문 또는 정책브리핑 공식 원문 직접 URL 확보
- [ ] 해당 공식 텍스트의 이용조건 확인
- [ ] OPIS 원문/상세자료 대조
- [ ] 재발방지대책 ↔ HERO 방어막 매핑 사람 검토
- [ ] HF/익명화/과노출 사람 검토

### 기술 게이트

- [x] JSON validate PASS
- [x] path exploration COMPLETE
- [x] 4종 엔딩 reachable
- [x] dominant choice warning 0
- [x] ending imbalance warning 0

**판정: SOURCE_HOLD — 사건후보 적합성은 높지만 공식 원문/권리/human gate가 남음.**

---

## 4. S03 — 절차 예상과 실제 상태가 어긋나는 순간

### 공식근거

원자력안전위원회 공식 보도자료/정책브리핑 원문을 확인했다.

- *원안위, 새울 3호기 시운전 시험을 위한 재가동 허용*, 2026-09-04.
  - https://www.korea.kr/briefing/pressReleaseView.do?newsId=156780201

공식 문안에서 확인된 핵심:

- 2026-08-11 시운전 중 자동정지 사건 조사 완료.
- 시험 후 출력 복구 과정에서 터빈제어밸브 위치제한기 설정치 입력 방향 오류가 원인으로 확인됨.
- 관련 시험·운전 절차 보완 및 특별교육 실시.
- 위치제한기 조작 시 재확인하도록 절차를 보완하고 운전 시스템에 반영.
- 원안위가 조치 및 재발방지대책의 적절성을 검토함.

### 이용조건

정책브리핑 페이지는 다음을 명시한다.

- 텍스트: **공공누리 제1유형(출처표시)** 이용 가능.
- 사진·이미지·일러스트·동영상: 별도 저작권 확인 필요.

HERO는 텍스트도 그대로 복제하지 않고 사실관계를 일반화하여 새 문안으로 작성하며, 외부 사진/도표는 사용하지 않는다.

### 남은 차단사항

- [ ] HF 전문가 검토
- [ ] 익명화·운전정보 과노출 사람 검토
- [ ] `incidentDebrief` 문안 최종 승인

### 기술 게이트

- [x] 공식 조사결과 확인
- [x] 공식 재발방지책 확인
- [x] 공식 텍스트 이용조건 확인
- [x] JSON validate PASS
- [x] path exploration COMPLETE
- [x] 4종 엔딩 reachable
- [x] dominant choice warning 0
- [x] ending imbalance warning 0

**판정: REVIEW_READY — 사람 HF/익명화 승인만 남음.**

---

## 5. 현재 승격 순서

1. **S03**: 가장 먼저 사람 검토 → 승인 시 `scenarios/data/` 승격 후보.
2. **S01**: OPIS 매핑 및 2012 KHNP 개별 저작물 이용표시 확인 후 사람 검토.
3. **S02**: 2024 원안위 공식 원문/이용조건과 OPIS 상세 대조 후 사람 검토.

## 6. 사람 검토 시 반드시 답할 질문

- 공개문안만 읽어도 실제 발전소·호기·설비를 역추적하기 지나치게 쉬운가?
- 실제 조작순서·설정값·설비구성이 재현될 정도로 구체적인가?
- 마지막 행동자를 사건의 단일 원인처럼 묘사하는 문장이 있는가?
- 공식 사실과 교육적 재구성이 분리되어 있는가?
- 게임용 PSF/Hazard Index를 공식 조사기관의 위험도나 HEP로 오해할 표현이 있는가?
- safe stop을 실패처럼 묘사하지 않는가?
- 여러 유효한 방어행동이 존재해 “정답 버튼”이 되지 않는가?
- 출처표시는 최종 앱/운영문서 어디에 둘 것인지 정했는가?

> 사람 승인은 체크박스만 자동으로 채우지 않는다. 승인자·일자·검토의견을 기록한 뒤에만 `data/` 승격이 가능하다.
