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

## 2.1 OAuth 복귀 주소 안전성

| ID | 수행 | 기대결과 | 상태 |
|---|---|---|---|
| AUTH-08 | `/login?next=/\\attacker.example`, `next=//attacker.example` 테스트 | 외부 주소로 복귀하지 않고 HERO `/`로 안전하게 복귀 | NOT RUN |
| AUTH-09 | 인코딩된 `%2f`, `%5c`, 제어문자 및 절대 URL 테스트 | 잘못된 복귀 경로는 모두 `/`로 정규화 | NOT RUN |
| AUTH-10 | 정상 `/i/<token>`, `/manager`, `/briefing/...`로 로그인 | 쿼리/해시 포함 유효한 앱 경로를 보존 | NOT RUN |
| AUTH-11 | Supabase OAuth와 로컬 E2E 로그인 경로 각각 검사 | 동일 `safeAppReturnPath` 검증 경유, 외부 이동 금지 | NOT RUN |

관련 격리 Node 검사: 21사례 통과 (전체 브라우저/E2E 미실행).

## 3.0 관리자 초대 발급 및 재발급의 응답 불확실성

| ID | 수행 | 기대결과 | 상태 |
|---|---|---|---|
| ADM-01 | Admin 발급 요청 후 응답 전 네트워크 단절 | 요청 결과 불확실 안내·자동 재발급 잠금·수락 대기 목록 대조 안내 | NOT RUN |
| ADM-02 | Admin 발급 완료 후 다른 담당자 발급 버튼 클릭 | 기존 일회용 링크가 자동으로 사라지지 않음; 명시적 보관 완료 필요 | NOT RUN |
| ADM-03 | 담당자 초대 재발급 요청 후 서버 5xx/응답 단절 | 중복 재발급 잠금; 이전 초대 취소 여부와 신규 초대 기록 확인 안내 | NOT RUN |
| ADM-04 | 기존 링크가 화면에 표시된 채 다른 초대를 취소 | 서로 다른 초대의 일회용 링크가 삭제되지 않음 | NOT RUN |
| ADM-05 | 서버 SITE_URL이 없거나 잘못된 경우 재발급 (격리환경) | 기존 초대 취소 전에 오류 발생, 기존 초대 유효 | NOT RUN |
| ADM-06 | 대체 초대 token_hash 충돌을 재현한 로컬 pgTAP | 원본 초대 취소·신규 생성·감사 기록 모두 rollback | NOT RUN |
| ADM-07 | 동일 초대를 두 요청에서 동시에 재발급 | 행 잠금으로 오직 한 요청만 성공, 두 번째는 기취소 응답 | NOT RUN |
| ADM-08 | role을 위조한 직접 RPC 요청 (anon/authenticated) | 실행 권한 없음; 서비스 역할에만 허용 | NOT RUN |
| ADM-09 | DB 017 미적용 상태에서 Edge 함수만 배포하는 시도 | 배포 게이트에서 차단, 먼저 migration 적용 | NOT RUN |
| ADM-10 | DB 018의 취소 RPC 감사 기록 INSERT를 실패주입 | 취소·감사 모두 롤백, 원래 링크는 유효 | NOT RUN |
| ADM-11 | 초대 수락과 취소 요청을 동일 링크에 동시 실행 | 행 잠금으로 하나의 최종 상태만 성공; 중간 취소·수락 상태 불허 | NOT RUN |
| ADM-12 | 취소 요청과 재발급 요청을 동일 링크에 동시 실행 | 한 요청만 성공, 반대 요청은 기취소 반환, 감사 중복 없음 | NOT RUN |
| ADM-13 | 발전소담당자 화면에서 재발급 완료 후 다른 초대 취소 | 화면의 일회용 재발급 URL 보존 | NOT RUN |
| ADM-14 | 발전소담당자 재발급 도중 5xx 또는 네트워크 단절 | 해당 링크 중복 재발급 차단, 수락 대기 목록 대조 안내 | NOT RUN |
| ADM-15 | 취소·재발급·생성 RPC 미배포 상태에서 Edge Function 교체 시도 | 016→017→018→019→020→021→022 DB 마이그레이션 완료 전 Edge 배포 금지 | NOT RUN |
| ADM-16 | create-invite 실행 시 감사 기록 INSERT를 실패주입 (격리 DB) | 신규 초대 INSERT도 같은 트랜잭션에서 롤백 | NOT RUN |
| ADM-17 | 토큰 해시 충돌 및 중복 생성 시도 (격리 DB) | 추가 초대/감사 기록 생성 없이 실패 | NOT RUN |
| ADM-18 | 담당자 단건 Player 초대 링크 생성 후 재발급 클릭 | 원래 일회용 링크가 덮어써지지 않음; 수동 보관 확인 전 새 발급 금지 | NOT RUN |
| ADM-19 | 신규 초대 RPC 권한/타 발전소 우회 | 서비스 역할만 실행 가능, DB에서 Admin/Manager 역할·소속 재확인 | NOT RUN |
| ADM-20 | DB가 이미 취소/수락된 초대, 타 발전소 등의 명시적인 요청 거절 | Edge가 409/403/404로 전달하고 화면이 응답 불확실성으로 잘못 판단하지 않음 | NOT RUN |
| ADM-21 | DB 연결 장애·RPC 결과 훼손·알 수 없는 DB 오류 | Edge 500 및 `internal_error`; 프런트는 미확정 요청에 자동 재시도하지 않음 | NOT RUN |
| ADM-22 | 개발자 로그에 SQL 상세 오류를 발생시킨 격리 시험 | 초대 토큰·SQL 내부 상세가 최종 사용자 HTTP 메시지에 노출되지 않음 | NOT RUN |
| ADM-23 | 초대 취소 DB commit 후 HTTP 응답 유실 | 동일 초대의 취소·재발급 재요청 모두 잠금, 자동 재시도 없음 | NOT RUN |
| ADM-24 | 초대 취소·재발급 후 명단 재조회 실패/null/손상 | 결과 확인 버튼 비활성·잠금 유지 | NOT RUN |
| ADM-25 | 명단 재조회 정상 결과만 받은 상태 | 결과 확인 버튼 활성화되나 잠금 유지, 사용자가 두 번째 단계 확인 필요 | NOT RUN |
| ADM-26 | 명단을 대조하고 명시적으로 두 번째 버튼 클릭 | 잠금 해제; 일회용 링크는 별도 저장 요구 유지 | NOT RUN |
| ADM-27 | PostgreSQL `P0001` 객체에 정확한 도메인 거절 코드 포함 | 안전한 4xx와 정확한 도메인 코드만 노출 | NOT RUN |
| ADM-28 | DB 비정상 SQLSTATE·메시지 상세·prototype/getter 위조 | HTTP 500 `internal_error`로 정규화·비정상 재시도 잠금 | NOT RUN |
| ADM-29 | 담당자 단건/CSV 초대 응답을 잃은 뒤 조회 없이 해제 시도 | 재발급 잠금 유지, 명단 재조회 및 사용자 대조 확인 필요 | NOT RUN |
| ADM-30 | 성공 HTTP 응답이지만 일회용 URL/만료일/초대 ID가 null 또는 누락 | 결과를 미확정으로 분류, 중복 생성 자동 재시도 금지 | NOT RUN |
| ADM-31 | Admin 담당자 초대 생성 결과 미확정 뒤 해제 시도 | 정상 Admin 목록 재조회 및 명시적 사용자 확인 전 재발급 금지 | NOT RUN |
| ADM-32 | Admin 재발급 결과 미확정 후 명단에서 이전 링크가 사라짐 | 재발급 잠금 유지, 명단 확인 후 수동 해제 및 토큰 재조회 불가 안내 | NOT RUN |
| ADM-33 | Admin 초대 취소 응답 유실 | 동일 초대 취소/재발급 둘 다 잠금 및 목록 대조 | NOT RUN |
| ADM-34 | Admin 초대 목록이 null 또는 필수 컬럼 누락으로 반환 | 잘못된 결과로 잠금 해제되지 않음 | NOT RUN |
| ADM-35 | Admin 화면에 보관 전 재발급 URL이 표시된 상태에서 해당 링크 취소 | 링크를 잃지 않도록 취소 작업 차단 | NOT RUN |
| PLY-01 | 담당자가 자기 발전소 Player 비활성화 후 재활성화 | 상태 변경과 각각의 감사 기록이 같은 트랜잭션에 저장 | NOT RUN |
| PLY-02 | 동일한 활성 상태로 두 번 변경 요청 | 두 번째는 `changed=false`, 감사 기록 추가 없음 | NOT RUN |
| PLY-03 | 다른 발전소 Player 또는 Manager/Admin 계정의 상태 변경 시도 | DB RPC에서 권한 또는 대상 범위 위반을 거부 | NOT RUN |
| PLY-04 | 상태 변경 감사 INSERT 실패주입 | 프로필 상태 변경도 롤백, 기존 활성 상태 유지 | NOT RUN |
| PLY-05 | 응답 유실/서버 5xx 후 상태 변경 버튼 재클릭 시도 | 명단 재조회 및 명시적인 잠금 해제 전에는 중복 변경 차단 | NOT RUN |
| PLY-06 | 동시에 비활성/재활성 변경 요청 | 최종 직렬화 순서대로 상태 저장·이벤트 1회씩 감사, 손실 업데이트 없음 | NOT RUN |
| NICK-01 | 담당자의 동일 발전소 Player 닉네임 강제 초기화 | 12자 PLAYER* 임시 닉네임, resetRequired true, 이력 1건·감사 1건 일치 | NOT RUN |
| NICK-02 | 다른 발전소 Player/담당자/관리자 대상 강제 초기화 | DB가 서비스 권한·소속을 재검증하여 차단 | NOT RUN |
| NICK-03 | 초기화 이력/감사 저장을 실패주입 | Player 닉네임/플래그와 이력/감사 모두 롤백 | NOT RUN |
| NICK-04 | 강제 초기화 후 서버 5xx·응답 단절 | 담당자 화면에서 추가 초기화 잠금, 명단 대조 후만 해제 | NOT RUN |
| NICK-05 | Player가 활성 시즌에 닉네임 1회 변경 | 닉네임/시즌 변경 이력/감사 동시 반영; 다음 자율 변경 차단 | NOT RUN |
| NICK-06 | Manager 강제 초기화 후 Player 닉네임 재설정 | 기존 시즌 변경 여부와 무관하게 복구 허용, resetRequired 해제 | NOT RUN |
| NICK-07 | Player 닉네임 변경 시 이벤트/감사 실패주입 | 변경 및 정책 사용횟수 모두 롤백 | NOT RUN |
| NICK-08 | Player 닉네임 변경 후 HTTP 응답 유실 | 내 프로필·닉네임 정책 재조회 성공 전 변경 잠금 | NOT RUN |
| NICK-09 | Player 동시 닉네임 변경 2개 요청 | 프로필 행 잠금으로 시즌당 정상 변경 1건만 통과 | NOT RUN |
| NICK-10 | 신규 닉네임 RPC 021/022 배포 순서 점검 | DB migration 적용/EXECUTE 권한 확인 전에 nickname-action Edge 배포 금지 | NOT RUN |
| NICK-11 | 중복확인 후 닉네임 입력값을 변경해 이전 사용 가능 응답 재사용 시도 | 입력값 불일치로 변경 버튼 비활성 | NOT RUN |
| NICK-12 | HTTP 200과 null/필수 속성 없는 닉네임 status 응답 | 닉네임 정책 미확정·변경 버튼 비활성 | NOT RUN |
| NICK-13 | 프로필 summary와 status의 닉네임이 일치하지 않을 때 잠금 해제 시도 | 불일치로 수동 재조회 필요·잠금 유지 | NOT RUN |
| NICK-14 | 열린 시즌이 없는 상태에 status가 `canChange=true` 반환 | 모순된 정책 거절·변경 버튼 비활성 | NOT RUN |

## 3.1 AuthProvider / 초대 수락 회귀 확인

| ID | 수행 | 기대결과 | 상태 |
|---|---|---|---|
| AUTH-01 | 초기 세션 조회와 SIGNED_IN 알림이 겹침 | 마지막 유효 인증상태만 화면에 반영 | NOT RUN |
| AUTH-02 | 계정 A 프로필 조회 도중 B로 계정 전환 | A 프로필/관리메뉴가 B에게 표시되지 않음 | NOT RUN |
| AUTH-03 | 프로필 조회 도중 로그아웃 | 뒤늦은 응답이 프로필을 되살리지 않음 | NOT RUN |
| AUTH-04 | 프로필 조회 API의 일시적인 5xx 또는 네트워크 오류 | 무초대 사용자로 오판하여 자동 로그아웃하지 않고 재시도 표시 | NOT RUN |
| AUTH-05 | 초대 수락 RPC 성공 직후 프로필 조회만 실패 | 초대를 다시 수락하지 않고 프로필 확인만 재시도 | NOT RUN |
| AUTH-06 | 성공적으로 수락한 초대 URL을 다시 열기 | 이미 사용된 링크 안내와 내 계정 이동 경로 제공 | NOT RUN |
| AUTH-07 | 미가입 사용자의 로그아웃 요청 자체 실패 | 성공으로 오표시하지 않고 실패/재시도 노출 | NOT RUN |

## 4. CSV 초대 회귀 시험 (개발 브랜치 변경)

| ID | 수행 | 기대결과 | 상태 |
|---|---|---|---|
| CSV-01 | Player 3명 CSV를 올려 초대 생성 | 생성 건마다 URL이 즉시 화면에 누적되고 CSV 저장 가능 | NOT RUN |
| CSV-02 | 생성 2건 성공 후 3번째 서버 호출을 의도적으로 실패시킴 | 2개 링크 보존, 총진행 2/3, 재시도 시 3번째부터 진행 | NOT RUN |
| CSV-03 | 200명 CSV로 요청 | 호출은 1회 최대 25건; 나머지는 단계별 재개, 기존 생성 링크 유지 | NOT RUN |
| CSV-04 | 결과 링크가 남은 채 다른 CSV 선택 | 기존 링크를 무조건 삭제하지 않고 먼저 다운로드 안내 | NOT RUN |
| CSV-05 | 서버 `SITE_URL` 누락/잘못된 값 테스트 (격리된 환경) | 초대 DB insert 이전에 오류, 사용 불가능한 초대 레코드 미생성 | NOT RUN |
| CSV-06 | 사용자 요청 쿼터 30회/600초에 근접 | 초과 요청은 429, 성공한 초대 링크는 보존, 실패한 행부터 재개 | NOT RUN |
| CSV-07 | 서버가 초대 DB 저장 후 응답이 끊김 또는 5xx | 이미 생성한 링크 보존, 자동 재개 잠금, 담당자 미수락 초대 확인 후 조치 안내 | NOT RUN |
| CSV-08 | 서버의 400/403/404/429 명시적 사전 거절 | 기존 링크 보존, 원인 해소 후 미완료 항목부터 재개 가능 | NOT RUN |

## 4.1 리더보드 발전소 범위 회귀 확인

| ID | 수행 | 기대결과 | 상태 |
|---|---|---|---|
| RANK-01 | 서로 다른 2개 발전소에 동일 표시명을 설정한 격리 테스트 데이터 | 전체 순위는 모두 표시, '우리 발전소'에는 본인 `plant_id` 점수만 표시 | NOT RUN |
| RANK-02 | 기존 발전소 표시명 변경 | 현재 시즌 점수 표시명 갱신, UUID 범위와 순위 유지 | NOT RUN |
| RANK-03 | 동일 표시명 발전소가 포함된 시즌 종료 및 과거 기록 조회 | 종료 시즌 '우리 발전소'와 '발전소×직무' 범위를 `plant_id` 기준으로 분리 | NOT RUN |
| RANK-04 | migration 016 적용 전·후 스키마/API·UI 계약 확인 | 신규 projection의 UUID 컬럼·GRANT·RLS·응답 타입 및 배포 SHA 일치 | NOT RUN |
| RANK-05 | 비활성 Player와 다른 역할 사용자 | 숨겨진 사용자를 전체/소속 순위 계산 전에 제외, 비허용 역할은 RLS 차단 | NOT RUN |

현재 staging DB에서는 신규 공개 projection 테이블 2개가 아직 없습니다. 위 항목은 모두 사람 또는 격리된 DB 검증 후에만 PASS로 표시합니다.

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
