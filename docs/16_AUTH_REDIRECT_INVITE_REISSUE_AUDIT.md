# HERO 인증 복귀 주소·초대 재발급 보안 점검

> 2026-10-08 · branch `work/actions-paused-batch-20261008` · **Actions paused**

## 1. 카카오 로그인 복귀 주소 — 수정 반영

`/login?next=`와 `signInWithKakao(returnPath)`는 사용자가 제공할 수 있는 경로를 입력받는다. 이전의 `startsWith("/") && !startsWith("//")` 검사로는 `/\\evil.example`을 차단하지 못했다. 브라우저 URL 파서는 이를 외부 origin으로 해석할 수 있다.

- `apps/web/src/lib/safeReturnPath.ts` : 백슬래시, protocol-relative, 제어문자, 인코딩된 위험한 구분자를 거부하며 WHATWG URL로 같은 origin인지 재확인
- `LoginPage.tsx`와 `lib/supabase.ts`가 공통 검사 함수 사용
- `safeReturnPath.test.ts`에 정상 5건 및 경계/공격 경로 16건을 추가
- **로컬 격리 검사:** Node 22로 해당 함수의 21개 사례 통과, TypeScript standalone check 통과. 전체 앱 통합 Vitest/TS 빌드/실제 Kakao 인증 검증은 **NOT RUN**

## 2. Admin 초대 및 재발급 — 부분 수정

- 발급 직후의 일회용 URL은 관리자 화면에서 명시적으로 정리하기 전까지 보존
- 응답 단절이나 서버 5xx는 발급 성공 여부 불명으로 간주하여 자동 재발급/중복요청 차단
- 다른 초대의 취소가 현재 화면에서 표시된 URL을 제거하지 않도록 수정
- `manager-user-action`의 `SITE_URL` 유효성 검사는 취소·생성 전에 수행
- 사용자 수동 확인표: `docs/14_KAKAO_LIVE_INVITE_VALIDATION.md` ADM-01~05, AUTH-08~11

## 3. 재발급 DB 원자성 — 코드 구현, 실제 검증 보류

이전에는 기존 초대 취소·대체 초대 INSERT·감사 로그가 분리되어 중간 실패 시 원본만 취소될 수 있었다. 배치 브랜치에 다음 코드를 추가했다.

- `supabase/migrations/202610080017_atomic_invitation_reissue.sql`: `public.reissue_invitation_atomic` 함수에서 원본 `FOR UPDATE` 잠금, 역할·발전소 재검증, 취소·재발급·감사 2건 단일 PostgreSQL 트랜잭션 처리
- `supabase/functions/manager-user-action/index.ts`: 개별 UPDATE/INSERT/감사 쓰기를 제거하고 service_role 전용 `.rpc("reissue_invitation_atomic")` 단일 호출로 변경
- `supabase/tests/invitation_atomic_reissue.test.sql`: 함수 실행 권한, Admin/Manager 범위, 비활성 사용자, 중복 해시 INSERT 실패 시 원본 초대·감사 기록 롤백 등 **21 assertions** 작성

**아직 PASS를 선언할 수 없다.** Migration 017은 원격에 적용되지 않았고 로컬 PostgreSQL/pgTAP을 실행하지 않았다. DB row lock 동시성·통신 단절·실 Kakao 초대 E2E도 미검증이다. 프런트엔드/Edge Function이 새 RPC를 호출하기 전에 DB migration이 적용되어야 한다. 실패 시나리오 검증을 통과할 때까지 배포 차단을 유지한다.

## 3.1 초대 취소 및 수락/재발급 충돌 처리 — 코드 구현, 실제 검증 보류

- `202610080018_atomic_invitation_cancel.sql`: `cancel_invitation_atomic`에서 기존 초대 행을 `FOR UPDATE` 잠그고 DB 실제 역할/발전소를 재검증한 뒤 취소와 감사 이벤트를 한 트랜잭션에서 저장.
- `manager-user-action/index.ts`의 취소 경로도 별도 UPDATE·Audit를 제거하고 service_role 전용 RPC로 교체.
- `invitation_atomic_cancel.test.sql` 27개 pgTAP 검사(권한, 범위, 기존 수락/취소, 재발급과의 선후 관계, 감사 INSERT 실패주입 롤백)를 작성하였으나 아직 실행하지 않음.
- 발전소담당자 대시보드에서 재발급 링크 보존 및 서버 응답 단절 후 자동 중복 발급 잠금을 적용.
- 실제 동시 요청 `cancel` vs `accept/reissue`는 별도 DB 세션과 E2E에서 검증해야 함. SQL 테스트에 포함된 연속 호출은 진짜 병렬 테스트가 아님.

## 3.2 신규 초대 원자적 발급 — 코드 구현, 실제 검증 보류

- `202610080019_atomic_invitation_creation.sql`: `create_invitation_atomic`으로 초대 INSERT와 `invitation.created` 감사 기록을 단일 DB 트랜잭션으로 결합. 활성 사용자·역할·발전소 검증은 DB가 다시 수행.
- `create-invite/index.ts`가 새 service-role-only RPC를 사용하며 기존 별도 INSERT/감사 호출을 제거. `SITE_URL` 검증과 토큰 생성·해시는 RPC 전에 진행.
- `invitation_atomic_creation.test.sql`에 **27 assertions** (권한, 스코프, 해시 충돌, 감사 기록 INSERT 실패 시 초대 생성 롤백) 작성.
- 발전소담당자 단건 Player 초대가 기존 일회용 링크를 덮어쓰지 못하도록 UI를 수정함.
- **테스트 미실행/원격 RPC 미적용**. 016→017→018→019 모두 로컬 DB에서 검증 완료 전 서비스 배포 금지.

## 3.3 Player 활성 상태 변경의 원자성 — 코드 구현, 실제 검증 보류

- `supabase/migrations/202610080020_atomic_player_status.sql` : `set_player_active_atomic` 서비스 역할 전용 RPC, 담당자/발전소/Player 권한 재검증, 행 잠금, 상태 변경과 감사 단일 트랜잭션.
- 이미 원하는 상태인 경우 `changed=false`를 반환하고 추가 감사기록을 남기지 않음. 감사 INSERT 실패 시 프로필 변경과 관련 트리거 효과를 롤백하도록 구성.
- `manager-user-action`의 별도 프로필 UPDATE+감사 INSERT 제거. `player_status_atomic.test.sql` 30개 회귀 항목 작성.
- 담당자 화면은 서버 응답/명단 조회가 불확실한 상태에서 재변경을 잠그고 수동 명단 대조 후 해제하도록 구성.
- Migration 020 미배포, 실제 로컬 DB/동시성/사용자 E2E 미검증. 출시 차단 유지.

## 3.4 닉네임 강제 초기화 및 Player 자율 변경 — 코드 구현, 실행 보류

- `202610080021_atomic_nickname_force_reset.sql`: 담당자 동일 발전소 Player 초기화에 `FOR UPDATE`, 새 임시 닉네임, 이력·감사 단일 트랜잭션. 33 pgTAP assertions.
- `202610080022_atomic_nickname_self_change.sql`: 활성 Player의 시즌 1회 정책·금칙어·중복 검사, 동일 프로필 행 잠금, 갱신+이력+감사 단일 트랜잭션. 강제 초기화 후 복구 예외 유지. 37 pgTAP assertions.
- 두 RPC 모두 `PUBLIC`/`anon`/`authenticated` 직접 실행 거부, `service_role`만 허용. `nickname-action` Edge는 RPC 호출 후 결과를 검증하고 알 수 없는 오류는 500으로 보호.
- 담당자 대시보드 및 Player 프로필은 응답 유실 시 상태 재조회까지 중복 닉네임 변경을 잠금. **단독/실환경 Deno·DB pgTAP·브라우저 E2E NOT RUN**.
- 신규 DB 테스트 계획 016~022 총 **218 assertions**. `docs/21_ATOMIC_NICKNAME_FORCE_RESET_VALIDATION.md`, `docs/22_ATOMIC_NICKNAME_SELF_CHANGE_VALIDATION.md` 참고.

## 4. 일괄 CI 재개 시

- `pnpm --dir apps/web test`로 리다이렉트 21개 사례 포함 전체 단위 테스트
- `pnpm --dir apps/web typecheck`, `pnpm --dir apps/web build`
- `deno check --config supabase/functions/deno.json supabase/functions/manager-user-action/index.ts`
- `deno test --config supabase/functions/deno.json supabase/functions/_shared/inviteUrl.test.ts`
- Kakao 실계정 로그인 / 새 사용자 차단 / 관리자·담당자 초대 성공·실패 시험
- `supabase test db`에서 Migration 017과 21 pgTAP 사례(특히 23505 rollback)를 확인하고, 동시 재발급·이미 수락된 초대/실패주입 E2E를 수행
- PR/main merge, migration016·017·018·019·020·021·022 적용, Supabase 실데이터 수정, 앱 배포는 승인된 통합검증 게이트 후에만 진행
