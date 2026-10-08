# HERO Migration 018 — 원자적 초대 취소 검증 계획

> 2026-10-08 KST | 브랜치 `work/actions-paused-batch-20261008`  
> **상태: IMPLEMENTED IN BRANCH / DATABASE TESTS NOT RUN / STAGING NOT APPLIED**

## 목적과 불변식

기존 Edge 취소 경로는 `SELECT` → `UPDATE canceled_at` → `INSERT audit_logs`를 서로 다른 DB 요청으로 실행했다. 수락·재발급과 충돌하면 취소 성공을 잘못 반환하거나, 감사 기록만 실패했을 때 취소 사실을 추적하지 못할 수 있었다.

Migration 018의 `public.cancel_invitation_atomic(uuid, uuid)`는 한 DB 트랜잭션에서 다음 불변식을 지키도록 설계한다.

1. 호출권한은 `service_role`만 보유하며 브라우저의 `anon`/`authenticated`는 직접 RPC 호출 불가.
2. 전달된 actor ID는 DB의 활성 `public.profiles`로 재검증. Admin은 Manager 초대, Manager는 동일 발전소 Player 초대만 취소 가능.
3. 대상 `public.invitations`를 `FOR UPDATE` 잠근다. `accept_invitation_atomic`(002), `reissue_invitation_atomic`(017)도 같은 행을 잠가 중복 상태변경을 방지한다.
4. 이미 수락·취소된 초대는 거부하고, 새 취소 시간과 `invitation.canceled` 감사 기록을 원자적으로 저장한다.
5. 감사기록 INSERT 실패 등 예외 시 취소도 트랜잭션 롤백한다.
6. Edge 취소 함수는 개별 UPDATE/Audit 호출을 제거하고 단일 `.rpc("cancel_invitation_atomic")` 응답만 확인한다.

## pgTAP 및 통합 검증

| 항목 | 증거 | 상태 |
|---|---|---|
| 롤별 EXECUTE 권한 | `invitation_atomic_cancel.test.sql` | NOT RUN |
| 동일 발전소 Player 초대 정상 취소 및 감사 1건 | pgTAP | NOT RUN |
| Admin의 Manager 초대 취소 | pgTAP | NOT RUN |
| 타 발전소·비활성 사용자·Player 권한 우회 차단 | pgTAP | NOT RUN |
| 이미 수락/취소한 초대 재처리 거부 | pgTAP | NOT RUN |
| 취소 후 재발급 / 재발급 후 기존 초대 취소 차단 | pgTAP | NOT RUN |
| 실패주입: 감사 INSERT 거부 시 취소도 롤백 | pgTAP | NOT RUN |
| 두 독립 DB 세션에서 동시 accept vs cancel | 병렬 트랜잭션 검증 | NOT RUN |
| 두 독립 DB 세션에서 동시 reissue vs cancel | 병렬 트랜잭션 검증 | NOT RUN |
| Manager Dashboard URL 보존/불확실 응답 잠금 | 브라우저 E2E | NOT RUN |
| 관리자·담당자·Player 실기기 확인 | 허가된 staging Kakao 계정 | NOT RUN |

`invitation_atomic_cancel.test.sql`의 테스트 선언은 **27 assertions**다. 이전 Migration016/017 추가 검사 64개와 합쳐 **91개 작성**으로 집계한다. **실행 성공 0건/미실행**이며 pgTAP은 데이터베이스에서 아직 수행하지 않았다. 연속 호출 검사는 실제 동시성 검증의 대체물이 아니다.

## 적용 순서 (배포 전 별도 승인 필요)

1. 로컬 테스트 DB에서 기존 001~015 + 준비된 016→017→018→019 마이그레이션을 순서대로 적용하고 전체 `supabase test db` 실행.
2. `deno check --config supabase/functions/deno.json supabase/functions/manager-user-action/index.ts`와 `pnpm --dir apps/web typecheck`, UI 테스트 실행.
3. 동시 트랜잭션 두 세션, HTTP 5xx/통신 단절, 감사 실패를 격리 DB에서 테스트하고 결과 증거를 기록.
4. 검증 및 배포 승인 후 원격 staging DB에 016→017→018→019를 먼저 적용.
5. 신규 RPC 3종(재발급·취소·발급) 존재와 grants 확인 후 Edge Function/웹앱 배포. **Edge를 DB보다 먼저 올리지 말 것**.
6. 허가된 3개 카카오 계정으로 초대/재발급/취소 E2E. 시나리오 S03 사람 승인은 별도 게이트.

### 2026-10-08 staging DB 읽기 전용 확인

기존 `accept_invitation_atomic` RPC는 존재한다. `reissue_invitation_atomic`(017), `cancel_invitation_atomic`(018) RPC는 둘 다 **미적용** 상태이다. 본 작업에서는 원격 DDL/데이터 변경을 수행하지 않았다.
