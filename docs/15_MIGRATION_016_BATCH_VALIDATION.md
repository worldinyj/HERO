# HERO Migration 016 — 배치 검증 전 점검표

> 작성: 2026-10-08 · `work/actions-paused-batch-20261008`  
> **NOT RUN**: GitHub Actions 비용 절약 운영 중. 원격 Supabase schema/data는 수정하지 않음.

## 변경 핵심

1. 기존 `private.v_season_scores_internal`을 active Player에 한정하여 순위 분모·rank 재계산.
2. 공개 읽기용 Current/Snapshot projection에 `plant_id` 추가. UUID는 발전소의 조직 구분자이며 개인 user ID가 아님.
3. `scope_type='plant'/'plant_job'`의 과거 projection에는 `leaderboard_snapshots.scope_plant_id`를 저장. overall/job 행에서는 NULL.
4. 현재 시즌 display_name 변경은 `public.plants` trigger가 관련 시즌 projection을 다시 계산. 과거 행은 사건 당시 표시명 보존, 필터는 UUID 사용.
5. `play_sessions`의 completed season_id/scenario_version_id 정정 시 season projection 갱신.
6. `my_record_summary()`가 실제 존재하는 시즌 metadata를 `public.seasons`에서 조회.

## 배치 DB 게이트

| 확인 | 예정 테스트 | 상태 |
|---|---|---|
| projection RLS 및 활성 Player 순위 재계산 | `leaderboard_projection_lifecycle.test.sql` · 23 assertions | NOT RUN |
| 사용자 본인 기록, 시즌 정합성 | `my_record_summary.test.sql` · 8 assertions | NOT RUN |
| 같은 표시명 다른 발전소/이름 변경/종료 시즌 분리 | `leaderboard_plant_identity.test.sql` · 12 assertions | NOT RUN |
| Frontend TypeScript 타입·쿼리 스코프 | `pnpm --dir apps/web typecheck` | NOT RUN |
| 로컬 pgTAP 정책 실행 | `supabase test db` | NOT RUN |
| staging Security Advisor / postmigration RLS | Supabase security advisor and read-only policy checks | NOT RUN |
| Admin/Manager/Player E2E | `docs/14_KAKAO_LIVE_INVITE_VALIDATION.md` | NOT RUN |

합계 **43개** pgTAP assertion 소스가 작성되어 있으며 이는 실행 성공 수를 의미하지 않습니다.

## 원격 데이터베이스 읽기 전용 확인

2026-10-08 KST에 확인한 staging `public.plants`:
- Unique: `plants_pkey (id)`, `plants_code_key (code)`
- `display_name` unique constraint 없음 → 같은 표시명 동시 사용 가능
- `to_regclass('public.leaderboard_current_public_rows')` = NULL
- `to_regclass('public.leaderboard_snapshot_public_rows')` = NULL

Migration 016은 **아직 배포되지 않았으며** 신규 테이블/컬럼 사용은 관련 DB 배포 이후에만 가능.

## 배포 시점 경계

- Merge, DB migration, Frontend deploy, Edge Function deploy를 각각 별도 단계로 관리하고 SHA·migration 목록을 기록.
- 프런트엔드 변경만 먼저 배포하면 신규 `plant_id` 컬럼이 없어 필터 쿼리가 실패한다. DB schema 승인·적용 후 동일 버전 앱으로 검증한다.
- 레거시 `v_leaderboard_*_public` view는 migration 016에서 제거된다. 보안검사에서 definer view 관련 오류가 해소됐는지 다시 확인.
- staging PASS 없이 `main` 릴리스 게이트를 승인했다고 기록하지 않는다.
