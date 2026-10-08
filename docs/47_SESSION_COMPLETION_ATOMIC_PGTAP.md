# HERO — T5-03 원자적 세션 완료 DB 회귀 시험

2026-10-08 | 브랜치 work/actions-paused-batch-20261008 | **DB 테스트 코드 작성 / 실행 보류**

## 검토 결과
- `supabase/migrations/202610070003_sessions.sql`의 `complete_play_session_atomic`은 먼저 해당 play_sessions 행을 `FOR UPDATE`로 잠그고 소유자 일치 여부를 확인한다.
- 첫 호출은 세션 완료 상태, 플레이 행동 결정들, 감사 로그를 단일 PL/pgSQL 트랜잭션에서 기록한다. 중복 호출은 저장된 결과와 already_completed=true를 반환하고 INSERT를 건너뛰는 구조다.
- `supabase/functions/submit-session/index.ts`는 API에서 `completed`인 세션에 대해 저장된 평가를 반환하고, RPC 반환 값에서 동시 호출 승자의 완료 영수증을 우선한다.
- 이 논리는 구조상 합리적이지만 **DB에서 실제 검증한 결과라고 주장할 수는 없다**.

## 새 pgTAP 33건
- RPC 실행 권한: anon/authenticated 차단, service_role 허용, 브라우저 spoof 실행 차단
- 세션 누락·소유권 불일치·flagged 상태 차단
- 첫 완료: 점수, 상태, 메트릭, 결정 로그 내용·개수, 감사 로그 1건
- 다른 점수·평가·행동 로그를 전달하는 중복 호출: already_completed=true, 원본 점수/로그/감사 유지
- 완료된 타인 세션의 idempotent 응답을 가로채는 시도 차단
- 중복 결정 seq로 삽입이 실패했을 때 세션 상태·부분 결정·감사 로그 전체 롤백, 이후 정상 재시도
- 감사 로그 trigger 실패를 강제로 발생시켰을 때 세션 상태·결정 기록 전체 롤백, 이후 정상 재시도
- 모든 Fixture 및 fault-injection trigger는 SQL `BEGIN ... ROLLBACK`으로 격리

## 실행 절차 및 제한
- 해당 파일: `supabase/tests/session_completion_atomic.test.sql`
- 추후 별도 로컬 Supabase 전체 마이그레이션(001~024)을 준비한 후 `supabase test db`에서 검증. 운영/스테이징 DB에서 직접 실행하지 않는다.
- pgTAP의 동일 트랜잭션 내 순차적 중복 호출 검증과 **진짜 서로 다른 DB 연결의 동시 호출**은 별개다. 동시 접속 테스트는 별도 2-connection harness로 확인해야 한다.
- 현재 실행 환경에서는 psql/Postgres 서버·Supabase CLI/pgTAP이 제공되지 않아 **테스트를 실행하지 않았다**. SQL 구조/33개 계획-어설션 개수 검증만 수행한다.
- 실제 DB 테스트가 PASS 하기 전 T5-03은 **PARTIAL**. 기존 코드 환산 진척 75.6% 유지.
- GitHub Actions, main, PR #79, 원격 Supabase, Cloudflare 미변경.

## 전체 pgTAP 선언 점검 수정 (2026-10-08)

신규 `session_completion_atomic.test.sql`과 닉네임 재설정 테스트 사이에 고정 UUID **4건 충돌**이 확인됐다. 세션 완료 전용 식별자 전체(b1~b6)를 고유한 e1a~e6a 접두어로 분리했다.

DB 테스트 전체는 **17개 파일, pgTAP 선언 417건**이다. 기존 **328건**은 선별된 12개 계약 테스트 소계이며, 전체 선언 수가 아니다. 정적 스크립트에 전체 17개 테스트의 `plan()` 일치 여부와 총 417건을 확인하는 검사를 추가했다. PostgreSQL에서 실행한 통과 수가 아니다.
