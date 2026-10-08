# HERO — PostgreSQL 2커넥션 세션 완료 경쟁 시험

2026-10-08 · batch branch · **테스트 도구 구현 완료, 실제 DB 실행은 미완료**

## 목적과 기존 증거

`complete_play_session_atomic`은 `FOR UPDATE`로 세션 행을 잠근다. 순차 호출/오류 롤백에 대한 pgTAP 33개(`supabase/tests/session_completion_atomic.test.sql`)와 별개로, **서로 다른 연결의 동시 호출을 직접 재현**하여 멱등성을 확인한다.

## 추가 산출물

- `scripts/test-session-completion-concurrency.py`: 두 psql 연결을 실행한다. 첫 연결에서 245 HP로 완료하지만 아직 커밋하지 않고, 둘째 연결이 1 HP로 같은 세션을 제출한다. 둘째 요청의 `pg_stat_activity.wait_event_type = 'Lock'` 대기를 확인한 후 첫 트랜잭션을 커밋한다. 둘째는 `already_completed=true`와 첫 점수 245를 받아야 한다.
- 최종 테이블 검증: 완료 상태 1건, 결정 1건, 감사 1건, 원본 행동 시계 유지.
- 임의 UUID·격리된 테이블 식별자 사용. **테스트 fixture가 COMMIT되고 audit 로그는 삭제할 수 없으므로 로컬 DB 초기화가 필수**다.
- 실행 대상 URL은 127.0.0.1/localhost/::1의 포트 54322, DB /postgres로 제한하며, `supabase status --output json`가 같은 로컬 DB URL을 보고해야 실행할 수 있다. `--ack-local-disposable` 없는 실행은 차단한다.
- `scripts/test_session_completion_concurrency_unit.py`: 12개 표준라이브러리 단위 테스트. 실제 연결 없이 URL 제한, 확인 절차, SQL fixture, 서로 다른 제출 점수, 결과 검사 규칙을 확인한다.
- `scripts/check-batch-db-contracts.mjs`: pgTAP 대상에 33건을 추가해 **기존 295건 → 328건 계획 검증**. 이는 정적 선언 수이며 실제 통과 수가 아니다.

## 로컬 실행 예시

로컬 PC에서 Docker와 Supabase CLI를 설치하고, **프로덕션/스테이징에 링크하지 않은 별도 로컬 환경**인지 확인한다. 테스트 DB 데이터는 초기화되므로 보존할 로컬 데이터가 있어도 실행하면 안 된다.

`python3 -m unittest discover -s scripts -p test_session_completion_concurrency_unit.py -v`
`supabase start`
`supabase db reset`
`HERO_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' python3 scripts/test-session-completion-concurrency.py --ack-local-disposable`
`supabase db reset`

## 검증 및 잔여 작업

- 격리 Python 3 문법 검사 및 단위 테스트 **12/12 PASS**.
- **psql/실제 PostgreSQL 2연결 시험 및 pgTAP 33건 실행은 이 세션에서 NOT RUN** (DB 실행 환경 없음).
- 로컬 환경에서 동시 호출 PASS 후에도 별도 네트워크 Edge API E2E와 브라우저 IndexedDB 2탭 시험이 남는다.
- GitHub Actions 중지, main/PR #79/원격 Supabase·Cloudflare 미변경. Tasklist 75.6%, T5-03 PARTIAL 유지.

## 검토 후 수정 (2026-10-08)

- 복수 SQL을 하나의 `psql --command`로 실행하면 반환된 SELECT 영수증 대신 마지막 `COMMIT` 결과만 표시될 수 있다. 두 번째 psql 세션도 명령을 stdin으로 순서대로 전달하고 종료 시 `communicate()`로 수신하도록 수정했다.
- 회귀 테스트에 SELECT 영수증 전달 방법과 `supabase status` 안전장치 확인 2건을 추가했다. Python strict 문법 검사 및 표준 라이브러리 단위 시험 **14/14 PASS**. 실제 Postgres 2연결 시험은 여전히 NOT RUN.

## 정적 DB 시험 전체 범위

`check-batch-db-contracts.mjs`의 328건은 선별된 12개 스위트 합계이다. 전체 pgTAP SQL은 **17개 파일, 417개 선언**이며 모든 `plan()` 수와 전 파일의 고정 UUID·테스트 이메일 충돌을 검사한다. 실제 PostgreSQL 실행 결과는 미확인.
