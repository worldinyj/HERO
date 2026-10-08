# HERO — Migration 023 Admin 발전소 원자적 관리·감사 검증

> 2026-10-08 KST · `work/actions-paused-batch-20261008`  
> **BATCH CODE ONLY / pgTAP 34 assertions WRITTEN NOT RUN / STAGING UNCHANGED**

## 배경과 보안 정책

Migration 001의 `plants_admin_write` RLS 및 `authenticated` 테이블 직접 INSERT/UPDATE/DELETE 권한은 Admin 기능에 필요했지만, 변경과 append-only `audit_logs` 기록의 원자성을 보장하지 않았다. Migration 023은 브라우저 직접 쓰기를 폐지하고 **서비스 역할 전용 DB RPC**를 통해서만 변경하도록 전환한다. RLS SELECT 범위는 유지하며, 서비스 역할 자격증명은 브라우저에 전달하지 않는다.

## 구현

- `supabase/migrations/202610080023_atomic_admin_plant_actions.sql`
  - `create_plant_atomic(actor,code,name,display_name)`: 활성 Admin 권한 재검증과 행 `FOR SHARE` 잠금, 코드 및 길이 검증, 신규 발전소 INSERT와 `plant.created` 감사 로그를 같은 트랜잭션으로 실행.
  - `set_plant_active_atomic(actor,plant_id,is_active)`: 활성 Admin 권한 재검증, 발전소 행 `FOR UPDATE`, 상태 및 `updated_at` 갱신과 `plant.active_changed` 감사 로그를 같은 트랜잭션에 실행. 현재 상태와 같으면 `changed=false` 반환, 중복 감사 없음.
  - 두 함수 모두 `SECURITY DEFINER / search_path=''`, `service_role`에만 EXECUTE; 기존 `plants_admin_write` 정책 삭제, `authenticated` 브라우저 테이블 쓰기 권한 철회.
- `supabase/functions/admin-plant-action/index.ts`: 유효한 Admin 세션, 입력 JSON/UUID 타입, rate limit 검사 후 서비스 역할 전용 RPC 호출. 결과 필드 불일치/2xx 손상 응답은 확정 불가 오류.
- `apps/web/src/features/admin/AdminOrgPage.tsx`: 직접 DB 쓰기 대신 Edge Function 호출. HTTP 5xx·네트워크 단절/응답 손상 또는 명단 재조회 실패 시 관련 변경 잠금 → 최신 발전소 명단 재조회 → 사용자 확인 후 해제.
- `apps/web/src/features/admin/plantActionResponse.ts`, `.test.ts`: 생성·상태 결과의 필수 필드, 요청 대상/값 정합성 검사.
- `supabase/tests/admin_plant_atomic.test.sql`: **34개 pgTAP assertions 작성**, Admin/Manager/비활성 Admin 권한, 브라우저 직접 권한 차단, 중복 코드, 잘못된 입력, no-op, 감사 실패 주입·롤백 및 재시도 포함. 트랜잭션 끝 `ROLLBACK`.

## 필수 검증 (전체 NOT RUN)

| 범주 | 기대 결과 |
|---|---|
| RPC 권한 | `anon`/`authenticated` 직접 호출 불가, `service_role`만 실행 |
| 행/권한 | 활성 Admin만 변경, 비활성 Admin·Manager/Player 거절 |
| 테이블 권한 | 인증 사용자 PostgREST 직접 INSERT/UPDATE/DELETE 불가 |
| 동시성 | 같은 발전소 상충 활성 상태 요청은 행 잠금 순서로 직렬화 |
| 감사 원자성 | audit INSERT 실패 주입 시 생성 또는 상태 변경 전체 롤백 |
| no-op | 같은 상태 재요청 시 새 감사 이벤트 없음 |
| 응답 유실 | HTTP 성공 불명 상태는 Admin 목록 2단계 재확인 전까지 잠금 |
| UI·타입 | 전체 웹 TypeScript/Vitest 및 Edge Deno 검사 |
| 실환경 | Supabase staging 적용 후 Admin/Manager/Player Kakao E2E 및 보안 점검 |

## 통합 검증 및 배포 순서

신규 DB 테스트 선언: 016 43 + 017 21 + 018 27 + 019 27 + 020 30 + 021 33 + 022 37 + 023 34 = **252 pgTAP assertions 작성**. 기존 테스트 파일과 합쳐 모든 SQL을 격리 DB에서 실제 실행해야 하며 선언 수만으로 PASS를 주장할 수 없다.

1. 로컬 저장소에서 `pnpm check:batch-db-contracts`, `pnpm --dir apps/web typecheck/test`, Deno 및 보안 스캐너 실행.
2. 격리 PostgreSQL에 Migration001~023 적용 후 전체 pgTAP 및 발전소 상충 상태 변경 동시성/롤백 재현.
3. 사용자 승인 후에만 Supabase staging에 Migration016→017→018→019→020→021→022→023 순차 적용, RPC grants 확인.
4. DB 적용 후 신규 `admin-plant-action`과 다른 Edge/웹을 호환 SHA로 배포, Admin 조직관리·실제 Kakao 다중 역할 E2E 실시.
5. GitHub Actions 최종 일괄 실행과 `main`/PR 병합은 기존 Actions 절약 정책에 따름.

**이번 배치에서는 GitHub Actions, `main`, PR, Supabase DB/Edge, Cloudflare staging, 실제 사용자 데이터를 변경하지 않는다.**
