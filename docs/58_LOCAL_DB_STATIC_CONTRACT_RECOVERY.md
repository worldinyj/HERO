# HERO — 로컬 DB 정적 계약 2건 수정

2026-10-08 · 브랜치 `work/actions-paused-batch-20261008`

## Mac 로컬 QA
로컬 운영 스크립트 시험 3건, ESLint, 4개 패키지 TypeScript, TASKLIST 검사는 통과했다. `pnpm check:batch-db-contracts`에서 정확히 2건 실패로 중단됐다.

## 1. 마이그레이션 016의 SQL 구문 오류
`private.refresh_current_leaderboard_from_plant()`에서 `as $ ... $;`가 쓰였다. PostgreSQL의 올바른 익명 dollar quote `as $$ ... $$;`로 수정했다. **검사기 오탐이 아니라 실제 SQL 문법 오류**였다.

## 2. Direct RPC와 operator Edge RPC의 계약 구분
`202610080024_plant_deactivation_boundaries.sql`은 브라우저가 직접 PostgREST로 호출하는 `public.my_record_summary()`에 `authenticated_profile_required` 권한 오류를 명시한다.
이 오류는 초대 Edge Function의 `_shared/invitationErrorStatus.ts`를 지나지 않는다. 따라서 024 파일에서 해당 함수 정의부터 **다음 함수 정의 전까지만** 직접 RPC 예외로 별도 검증한다. 나머지 모든 operator RPC의 `RAISE EXCEPTION`은 기존 Edge 오류 4xx allowlist에 매핑돼야 한다.
호출 경로와 무관하게 invitationErrorStatus의 공개 4xx 오류 목록을 확장하지 않았다.

## Mac에서 재검증
1. `git pull --ff-only origin work/actions-paused-batch-20261008`
2. `pnpm check:batch-db-contracts`
3. 통과하면 `node scripts/hero-local.mjs qa`

아직 Mac 재실행, 실제 PostgreSQL 마이그레이션·pgTAP 실행은 미완료다. GitHub Actions·main·원격 DB·배포는 변경하지 않는다.
