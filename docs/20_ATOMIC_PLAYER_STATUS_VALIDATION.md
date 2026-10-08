# HERO Migration 020 — Player 활성 상태 변경 원자성 검증

> 2026-10-08 KST · `work/actions-paused-batch-20261008`  
> **CODE WRITTEN / pgTAP NOT RUN / STAGING NOT APPLIED / RELEASE BLOCKED**

## 결함과 수정

기존 `manager-user-action`의 `set-player-active`는 별도의 DB 요청으로 (1) Player 프로필 조회 (2) `is_active` UPDATE (3) 감사 INSERT를 수행했다. 감사 기록 실패/동시 변경이 발생하면 상태 변경 결과와 감사 기록이 불일치할 수 있고, 응답 단절 후 화면이 오래된 Player 상태를 기준으로 재요청할 수 있다.

- `supabase/migrations/202610080020_atomic_player_status.sql`: `public.set_player_active_atomic(p_actor_user_id uuid, p_profile_id uuid, p_is_active boolean)`.
- `supabase/functions/manager-user-action/index.ts`: Player 업데이트를 위 RPC 한 번으로 교체.
- `supabase/tests/player_status_atomic.test.sql`: 권한·범위·중복 감사 방지·감사 실패 롤백 등 **30 pgTAP assertions**.
- `apps/web/src/features/manager/ManagerDashboardPage.tsx`: 응답 결과 불확실 또는 DB 변경 후 명단 재조회 실패 시 해당 Player 재변경 잠금. 사용자 명시적 재조회 성공 후 잠금 해제.

## 데이터베이스 계약

1. Edge Function만 `service_role`으로 RPC를 호출. `PUBLIC`, `anon`, `authenticated`는 함수 실행 불가.
2. actor가 활성 `plant_manager`이며 `plant_id`가 있는지 데이터베이스에서 재확인.
3. 대상 프로필을 `FOR UPDATE` 잠금. actor와 동일 발전소의 `player`만 허용; 다른 발전소 및 관리자/담당자 대상은 `player_not_found`로 제한.
4. 변경하려는 상태가 현재와 같으면 `changed=false`로 반환하고 감사 INSERT를 수행하지 않음.
5. 상태가 다르면 `UPDATE profiles.is_active` 및 `INSERT audit_logs`를 동일 트랜잭션에 실행. 감사 INSERT가 실패하면 프로필 UPDATE도 롤백.
6. 경쟁 요청은 동일 Player 행 잠금으로 순서가 결정됨. 실제 두 세션 병렬 시험은 아직 수행하지 않음.

## 검증 게이트

| 검사 | 기대값 | 상태 |
|---|---|---|
| 함수 GRANT 및 브라우저 직접 접근 차단 | anon/authenticated 사용 불가, service_role만 허용 | NOT RUN |
| 동일 발전소 Player 비활성/재활성 | 상태 및 감사 이벤트 일치 | NOT RUN |
| 이미 같은 상태로 반복 요청 | `changed=false`; 감사 중복 0 | NOT RUN |
| Manager·Admin·타 발전소 Player 변경 차단 | DB 권한·소속 재확인 | NOT RUN |
| 감사 로그 INSERT 실패 주입 | 이전 활성상태 유지, 감사 누락·부분 변경 없음 | NOT RUN |
| Player 비활성화 후 현재 시즌 랭킹에서 제외/복귀 | 리더보드 projection·랭킹 집계 정합성 | NOT RUN |
| 서로 반대되는 두 상태 변경 요청 동시 실행 | row lock 동작 및 감사 이벤트 정합성 | NOT RUN |
| 응답 단절 후 UI 잠금/수동 명단 대조 | 실 브라우저 E2E | NOT RUN |
| `deno check` 및 `pnpm --dir apps/web typecheck` | strict TypeScript / Edge compile | NOT RUN |
| `supabase test db` 전체 | 전체 migration/DB 정책 테스트 | NOT RUN |

Migration016 43 + 017 21 + 018 27 + 019 27 + 020 30 = **148개 추가 pgTAP 검증항목 작성**. 전체 데이터베이스 테스트 성공이라는 의미가 아니다.

## 안전한 일괄검증·배포 순서

1. Actions 사용 허가 후 최종 PR SHA 기준으로 CI·Database Policy Tests·E2E를 **한 번에** 실행. 기존 초대/리더보드 검사를 포함.
2. 로컬 테스트 DB에서 Migration001~022를 순서대로 적용, 016~020 포함 pgTAP 전체 검사.
3. 별도 두 트랜잭션으로 동일 Player에 활성↔비활성 동시성 시험. Player 랭킹 재계산에 부작용이 없는지도 확인.
4. 위 검증과 배포 승인 후 staging DB Migration016→017→018→019→020→021→022를 **Edge/웹 배포 전에** 적용.
5. 새 RPC 6종(초대 3·Player 상태 1·닉네임 2)의 `service_role`만 실행 권한, 기존 RLS/프로필·랭킹 트리거 상태를 검증.
6. 배포 SHA/DB 버전/Edge 버전을 기록하고 통제된 Kakao Admin→Manager→Player 실계정 E2E 실시.
7. 실증/법무/개인정보/S03 사람 검토 등 기존 출시 차단 게이트는 별개로 유지.

2026-10-08 읽기 전용 Supabase 확인: `public.profiles`의 필요한 열과 역할 enum은 확인했지만 **`set_player_active_atomic` RPC는 존재하지 않음**. 원격 DB에는 아무 변경도 적용하지 않았다.
