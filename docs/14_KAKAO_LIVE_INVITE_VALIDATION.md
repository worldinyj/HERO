# HERO Kakao 실제 초대 검증표 — Admin → Plant Manager → Player

> 기준: 2026-10-08 / **STAGING MANUAL VALIDATION — NOT EXECUTED**  
> 화면: `https://hero-dnr.pages.dev`  
> 운영 기준: 실제 서로 다른 3개 Kakao 계정이 필요하며, 한 계정으로 3개 역할을 재현하지 않는다.  
> 관련: [#77](https://github.com/worldinyj/HERO/issues/77), `docs/13_ACTIONS_BATCH_MODE.md`

## 1. 검증 원칙

- 테스트 계정은 운영 허가받은 사용자만 사용한다. 관리자 인증정보·초대 토큰·서명 URL·Kakao ID·이메일 주소를 이슈/스크린샷에 기록하지 않는다.
- 실사용자 데이터 정정·탈퇴·비활성화는 별도 승인 없이 실행하지 않는다.
- 보안 경계 검사는 **화면의 버튼 유무뿐 아니라 REST/RPC 및 Edge Function의 서버 차단**도 확인한다.
- 실제 시험기록은 테스트자·시험일시·환경·역할·절차·예상결과·실제결과·증거 참조·PASS/FAIL/HOLD로 구분한다.
- 본 문서는 검증 절차일 뿐 결과/승인서가 아니다. 완료되지 않은 항목은 **NOT RUN**으로 둔다.

## 2. 사전 조건

| ID | 조건 | 점검 |
|---|---|---|
| PRE-01 | staging 페이지, Supabase, Kakao OAuth 승인된 설정 | NOT RUN |
| PRE-02 | 서로 다른 Kakao 계정 A(Admin), B(Manager), C(Player) | NOT RUN |
| PRE-03 | Admin 프로필 1개 존재하고 활성 상태 | 읽기 전용 기존 기록: 1개; 실행 전 재확인 |
| PRE-04 | 초기 Manager / Player 프로필은 아직 없음 | 읽기 전용 기존 기록: 0 / 0; 실행 전 재확인 |
| PRE-05 | 1회용 Manager 초대 1개 유효 (새 발급 대신 기존 초대 우선) | 읽기 전용 기존 기록: 1개; 만료/취소 상태 재확인 |
| PRE-06 | 현재 staging 배포 SHA, DB migration version, Edge Function 버전 기록 | NOT RUN |
| PRE-07 | GitHub Actions 실행 최소화 정책 유지 | `docs/13_ACTIONS_BATCH_MODE.md` |

## 3. 필수 End-to-End 확인

| ID | 수행 | 기대결과 | 상태 |
|---|---|---|---|
| INV-01 | 계정 A가 Admin으로 로그인 | Admin 메뉴·소속/역할 정상, Player 점수/학습지표 공유 금지 | NOT RUN |
| INV-02 | Admin이 허가된 발전소에 담당자 초대 발급 | 일회용 URL 발급·기한 표시·감사기록; 토큰 원문 DB/로그 보관 금지 | NOT RUN |
| INV-03 | 계정 B가 초대 URL에서 Kakao 로그인 | 초대 대상 발전소·역할 표시, 동의 및 닉네임 검증 | NOT RUN |
| INV-04 | B가 약관/개인정보 동의 후 수락 | plant_manager 프로필 1개 생성, 초대 수락 표시, 중복 수락 거부 | NOT RUN |
| INV-05 | B가 본인 발전소에 Player 초대 | 발급 성공, **다른 발전소 초대는 거부** | NOT RUN |
| INV-06 | 계정 C가 별도 Kakao 로그인 후 Player 초대 수락 | Player 프로필 생성, 선택한 발전소·직무 일치 | NOT RUN |
| INV-07 | 계정 C가 경쟁 플레이·내 기록·리더보드 접근 | 현재 게시/허가된 시나리오만 접근; 본인 기록만 열람 | NOT RUN |
| INV-08 | 계정 B가 C의 개인 점수·세션·선택로그 직접 조회 시도 | 서버에서 차단. B에게 허가된 참여 현황·n≥5 집계만 노출 | NOT RUN |
| INV-09 | 무초대 계정 D가 직접 /login으로 접근 | 신규 프로필 생성 불가, 초대 필수 안내 후 세션 종료 | NOT RUN |
| INV-10 | 만료·취소·재사용된 초대 링크 요청 | 수락 거부 및 적절한 상태 메시지 | NOT RUN |
| INV-11 | 닉네임 중복/금칙어/검증중 값 변경 | 수락 버튼 비활성화, 서버의 원자적 최종 검증 유지 | NOT RUN |
| INV-12 | 발급·수락·취소 등 주요 행동의 감사 기록 확인 | 민감 토큰 없이 actor·role·plant·결과 추적 | NOT RUN |

## 4. CSV 초대 회귀 시험 (개발 브랜치 변경)

| ID | 수행 | 기대결과 | 상태 |
|---|---|---|---|
| CSV-01 | Player 3명 CSV를 올려 초대 생성 | 생성 건마다 URL이 즉시 화면에 누적되고 CSV 저장 가능 | NOT RUN |
| CSV-02 | 생성 2건 성공 후 3번째 서버 호출을 의도적으로 실패시킴 | 2개 링크 보존, 총진행 2/3, 재시도 시 3번째부터 진행 | NOT RUN |
| CSV-03 | 200명 CSV로 요청 | 호출은 1회 최대 25건; 나머지는 단계별 재개, 기존 생성 링크 유지 | NOT RUN |
| CSV-04 | 결과 링크가 남은 채 다른 CSV 선택 | 기존 링크를 무조건 삭제하지 않고 먼저 다운로드 안내 | NOT RUN |
| CSV-05 | 서버 `SITE_URL` 누락/잘못된 값 테스트 (격리된 환경) | 초대 DB insert 이전에 오류, 사용 불가능한 초대 레코드 미생성 | NOT RUN |
| CSV-06 | 사용자 요청 쿼터 30회/600초에 근접 | 초과 요청은 429, 성공한 초대 링크는 보존, 실패한 행부터 재개 | NOT RUN |

## 5. 증거 양식

```text
검증 ID:
일시/시간대:
환경/배포 SHA / DB migration:
검증 역할: A(Admin) / B(Manager) / C(Player) / D(Uninvited)
사전조건:
수행절차:
기대결과:
실제결과:
판정: PASS / FAIL / HOLD / NOT RUN
오류코드/로그 참조(토큰·개인정보 제거):
후속 조치:
검증자:
```

## 6. 최종 출시 게이트

- 모든 필수 시험 기록 및 보안 권한 경계 PASS
- Migration 016 및 리더보드 RLS/pgTAP/CI/E2E 검증 PASS
- S03 사람 HF·운전·익명화·Just Culture·debrief 검토 별도 PASS
- 개인정보/약관, 실기기·사내망, 파일럿 승인, 동일 SHA Staging Smoke/RC 게이트

**어느 한 항목이 보류라면 해당 항목을 완료했다고 표시하지 않는다.**
