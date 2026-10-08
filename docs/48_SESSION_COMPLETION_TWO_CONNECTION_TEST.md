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

## 연결 경로 안전성 보강 (2026-10-08)

- `postgresql://127.0.0.1:54322/postgres?host=remote.example.com`처럼 **libpq 쿼리 옵션으로 실제 접속 대상을 덮어쓰는 URL을 거부**한다. fragment 및 postgres가 아닌 DB 사용자도 거부한다.
- `PGHOSTADDR`, `PGSERVICE`, `PGOPTIONS` 등을 포함한 셸의 모든 `PG*` 환경변수를 외부 psql 프로세스에 물려주지 않고, 검증된 DSN과 고유 `PGAPPNAME`만 넘긴다.
- 감시용 `pg_stat_activity`는 `hero_race_second_<고유 token>`인 연결만 검사하므로 다른 시험 프로세스의 잠금을 착각하지 않는다.
- Python 3 문법 검사와 수정된 단위 테스트 **18/18 PASS**, 실제 PostgreSQL 두 연결 시험은 여전히 NOT RUN.

## 첫 번째 트랜잭션 실패 복구 경로 (2026-10-08)

- `probe_first_rollback()`을 추가했다. 첫 번째 PostgreSQL 연결이 245 HP로 완료 RPC를 실행하지만 커밋하지 않고 세션 행 잠금을 유지한다.
- 두 번째 연결은 **동일 세션에 대해 1 HP** 완료를 시도해 잠금 대기가 확인된다. 첫 번째 연결에서 ROLLBACK을 실행하면 두 번째 연결의 반환은 `already_completed=false`, 1 HP여야 한다.
- 마지막으로 결과 점수 1 HP, 결정 기록 1건(시계 9), 완료 감사 로그 1건을 확인해 **부분 반영이나 중복 INSERT가 없는지** 점검한다.
- 두 경로의 별도 난수 fixture를 사용하며, 실패 시 연결 종료 과정에서 이미 닫힌 stdin을 다시 flush하지 않도록 보호했다.
- Python 문법 검사와 표준 라이브러리 단위 테스트 **20/20 PASS**. 실제 로컬 PostgreSQL 2연결 시험은 아직 NOT RUN. 완료/롤백 fixture가 로컬 DB에 커밋되므로 종료 후 로컬 DB 초기화가 필요하다.

## DB 없이 실제 subprocess orchestration을 실행하는 모의 시험 (2026-10-08)

- 새 `scripts/test_session_completion_concurrency_flow_unit.py`는 `Popen`과 `sql`을 메모리 모의 객체로 교체하여 **프로브 함수 자체를 실행**한다. 실제 PostgreSQL·Supabase 서비스나 네트워크를 사용하지 않는다.
- 8개 시나리오: 첫 번째 커밋 승자, 첫 번째 롤백 뒤 두 번째 승자, 잘못된 영수증 점수(각 경로), 영수증 누락, 완료 DB 상태 불일치, 행 잠금 감지 실패(각 경로).
- 기존 URL·환경변수·SQL 생성 20건과 합쳐 로컬 Python 단위 시험 **28/28 PASS**; Python 3.13 문법 검사 PASS.
- 실행: `python3 -m unittest discover -s scripts -p 'test_session_completion_concurrency*_unit.py' -v`
- **검증 한계:** 이 시험은 PostgreSQL 구현의 실제 잠금 동작이 아니라 도구의 상태 전이·오류 판정을 검사한다. 별도의 Supabase 로컬 DB 2연결 실험과 pgTAP은 여전히 NOT RUN.
