# HERO Migration 021 — 담당자 강제 닉네임 초기화 원자성

> 2026-10-08 KST · `work/actions-paused-batch-20261008`  
> **IMPLEMENTED IN BATCH BRANCH / pgTAP NOT RUN / STAGING NOT APPLIED**

## 원자성 계약

`public.force_reset_nickname_atomic(p_actor_user_id uuid, p_profile_id uuid)`는 서비스 역할만 호출한다. 실제 DB에서 활성 `plant_manager`·소속 발전소를 검증하고 동일 발전소 Player 프로필만 `FOR UPDATE`로 잠근다.

성공 시 12자 PLAYER 임시 닉네임으로 변경하고 `nickname_reset_required=true`로 지정하며, `nickname_change_events.manager_reset` 이벤트와 `audit_logs.nickname.force_reset`을 **동일 DB 트랜잭션**에서 기록한다. 임시 닉네임의 고유성 충돌은 제한된 재생성으로 대응하며, 최종 실패·이력/감사 쓰기 실패 시 모든 프로필 변경을 롤백한다.

구현 코드:
- `supabase/migrations/202610080021_atomic_nickname_force_reset.sql`
- `supabase/functions/nickname-action/index.ts`
- `supabase/tests/nickname_force_reset_atomic.test.sql`: **33 pgTAP assertions 작성 (실행 전)**
- `apps/web/src/features/manager/ManagerDashboardPage.tsx`: 응답 불명/재조회 실패 시 동일 Player 초기화 버튼 잠금 및 명시적 명단 재조회

## 주요 미실행 시험

| 시험 | 기대값 | 상태 |
|---|---|---|
| service_role만 EXECUTE, anon/authenticated 직접 호출 차단 | 권한 격리 | NOT RUN |
| Admin·Manager·Player 권한 및 타 발전소 교차 요청 | 경계 차단 | NOT RUN |
| Player 임시 닉네임·resetRequired, 이력·감사 비교 | 3종 데이터 일치 | NOT RUN |
| 비활성 Player의 초기화 (기존 정책 유지) | 기록 후 Player 비활성 상태 보존 | NOT RUN |
| 닉네임 이력 INSERT 실패 주입 | 프로필 변경/감사 모두 rollback | NOT RUN |
| 감사 INSERT 실패 주입 | 프로필 변경/이력 모두 rollback | NOT RUN |
| 반복·경쟁 강제 초기화 요청 | 같은 행 잠금과 감사 이벤트 일관성 | NOT RUN |
| HTTP 응답 단절 후 담당자 화면 재조정 | 새 닉네임 확인 전 중복 요청 금지 | NOT RUN |
| 실제 Kakao 계정으로 사용자 복구 검증 | 단계별 승인 필요 | NOT RUN |

## DB 적용 및 검증 제약

원격 Supabase 읽기 전용 조회에서 `nickname_change_events`, `nickname_forbidden_terms`, `profiles.nickname_reset_required`의 필요한 스키마 존재를 확인했다. 이 신규 함수는 **원격 미적용** 상태이다.

독립 로컬 DB에서 Migration 001~022 전부 적용 및 DB pgTAP, 실제 동시성·실기기 E2E를 통과한 후, 별도 승인하에서만 016→017→018→019→020→021→022 DB 적용, 이어 Edge Function과 웹앱 배포. Actions/PR/main/실사용자 데이터는 현 배치에서 변경하지 않는다.
