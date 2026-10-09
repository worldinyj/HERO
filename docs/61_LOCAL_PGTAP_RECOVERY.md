# HERO — 실제 로컬 pgTAP 오류 수정 기록

2026-10-08 | 브랜치 `work/actions-paused-batch-20261008`

## 근거

Mac의 Supabase 로컬 개발 서버가 포트 55321(API)/55322(PostgreSQL)로 정상 시작됐으며 총 24개 마이그레이션이 적용됐다. `supabase test db --local`의 17개 pgTAP 파일 중 14개는 통과, 3개 파일에서 실패했다.

- `nickname_self_change_atomic.test.sql`: 2개 `throws_ok($select ... $,` 구문이 파싱 오류를 내면서 계획 39건 중 37건만 실행.
- `player_status_atomic.test.sql`: 2개 동일 오류, 계획 32건 중 30건만 실행.
- `rls_role_matrix.test.sql`: 계획 42건 중 관리자 직접 `public.plants` INSERT 성공을 기대한 구버전 테스트 1건 실패. 보안 마이그레이션 202610080023은 `authenticated` 역할의 직접 쓰기를 철회하여 감사일체형 `create_plant_atomic` 경유를 강제한다.

## 적용 수정

1. 위 4개 `throws_ok`의 SQL 리터럴을 `$$select ... $$`로 수정 (기존 39/39, 32/32 선언 유지).
2. 보안 회귀시험은 `lives_ok` 대신 `throws_ok`에서 SQLSTATE `42501`을 확인하도록 바꿨다 (기존 42건 유지). 관리자 브라우저 직접 INSERT 권한은 복구하지 않는다.
3. 정적 검사기에서 잘못된 단일달러 SQL 구문을 검출한다. `$$select ... $$`와 유효한 `$select$ ... $select$`는 오탐 없이 허용한다.
4. RLS 시험에 인증 관리자 직접 등록 차단 주장 존재 여부를 확인한다. 마이그레이션·Edge Functions·실제 권한 정책은 변경하지 않는다.

## Mac에서 검증 순서

```bash
git pull --ff-only origin work/actions-paused-batch-20261008
pnpm check:batch-db-contracts
supabase test db --local
node scripts/hero-local.mjs qa --with-db
```

마지막 단계는 DB 시험의 실제 통과가 확인된 뒤 실행할 것. 테스트 재실행은 미확인 상태이며 PASS로 표기하지 않는다.

운영 Supabase, main, PR #79, GitHub Actions, Cloudflare 배포는 미변경. 출력에 포함된 로컬 키·스토리지 자격증명은 공유 시 마스킹하며, 개발 서버의 0.0.0.0 호스트 바인딩에 주의한다.
