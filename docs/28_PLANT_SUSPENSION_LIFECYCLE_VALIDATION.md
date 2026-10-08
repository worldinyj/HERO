# HERO — 발전소 중지·재활성화 / 초대 무효화 / 교육 이력 보존 검증

> 2026-10-08 KST · `work/actions-paused-batch-20261008`  
> **CODE ONLY — STAGING NOT APPLIED — DB pgTAP, Deno, Vitest, Kakao E2E NOT RUN**

## 결정된 정책

- **운영 중지 = 교육 실행 정지이며, 삭제가 아님.** 발전소·프로필·교육 세션·감사 로그는 보존한다.
- 중지 후 발급되지 않은 과거 초대 링크는 다시 활성화해도 사용할 수 없다. 초대 발급 세대(`plants.invitation_epoch` / `invitations.plant_invitation_epoch`)가 다르면 무효화한다.
- 중지 시 담당자/Player의 신규 초대 발급·수락, Player 프로필 변경, 교육 시작·완료를 DB에서 거절한다. 서비스 역할 Edge도 발전소 `is_active`를 확인한다.
- 중지된 발전소의 담당자는 발전소 전체 조회·관리 범위를 잃는다. **활성 Player는 자신의 과거 교육 세션·결정·학습 요약에 대해서만 읽기 권한을 유지**하며 타인 기록은 볼 수 없다. 개인 계정 자체가 비활성화되면 과거 이력 열람도 차단한다.
- Admin은 중지·재활성화 전에 발전소 코드 재입력 및 영향 확인란을 체크해야 한다. 중지하면 운영 담당자와 Player에 영향이 있고, 기존 링크는 영구 무효화됨을 명시한다.

## 기존 비활성 발전소의 초기 보정

Migration 024를 처음 적용할 때, 이미 중지된 발전소의 기존 초대 링크도 `plant_invitation_epoch=0` 기본값을 갖는다. 이에 해당 발전소의 `invitation_epoch=1`로 초기 보정한다. **이 단계가 없으면 재활성화 시 이전 링크의 epoch 0이 맞아 우발적으로 다시 유효해질 수 있다.** 활성 발전소는 epoch 0으로 시작해 정상 초대를 보존한다.

이 보정은 실제 운영 DB에 아직 수행하지 않았다. 별도 빈 격리 DB에서 *Migration023까지 적용 후*, 비활성 발전소/과거 미수락 초대 fixture를 추가하고 Migration024를 적용하여 epoch 불일치 및 재활성화 후에도 사용 불가인지 확인해야 한다.

## 경계별 구현 파일

| 경계 | 파일 | 내용 |
|---|---|---|
| Migration | `supabase/migrations/202610080024_plant_deactivation_boundaries.sql` | 세대 초기 보정, 트리거, 활성 범위 RLS, 과거 이력 owner SELECT 정책, `my_record_summary` |
| Edge | `supabase/functions/_shared/supabase.ts` | 비활성 발전소의 Player/담당자 작업 사전 차단 |
| 초대 조회 | `supabase/functions/peek-invite/index.ts` | 비활성·epoch 불일치 사유 반환, DB 장애와 없는 토큰 구분, 내부 오류 미노출 |
| Admin UI | `apps/web/src/features/admin/AdminOrgPage.tsx`, `plantTransitionConfirmation.ts` | 코드 재입력·영향 동의, 위험한 상태 전환 직전 확인 |
| DB 검증 | `supabase/tests/plant_deactivation_epoch.test.sql` | **39개 pgTAP 선언** (DB 실행 전), 관리자 범위 차단, 구 링크 무효화, 교육 동결·재개, 본인 이력 owner 접근 |
| WEB 검증 | `apps/web/src/features/admin/plantTransitionConfirmation.test.ts` | 승인되지 않은 상태 전환 방지 (Vitest 미실행) |

## 비활성 발전소 초대의 운영 목록 제외

- 기존 `invitations` 행은 감사·조사 목적을 위해 유지한다. 세대 불일치가 발생한 링크는 실제 초대 수락도 불가능하고, 새로 복귀한 발전소의 운영 명단에도 노출되어서는 안 된다.
- Migration024에서 `manager_pending_invites()`에 발전소 현재 세대 일치 조건을 추가했다.
- Admin 조직관리 목록은 `invitation_epoch`과 `plant_invitation_epoch`을 함께 조회해 `currentPendingInvitations()`로 현재 세대 초대만 노출한다. 목록 형식이 누락되면 확인 완료로 판정하지 않는다.
- pgTAP 2개 추가: 재활성화 후 구세대 초대 0건, 신규 세대 초대 1건. 누적 신규 선언 **291개**, 실제 DB 테스트는 **NOT RUN**.
- Migration024의 `my_record_summary()` 함수 본문 구분자 오류(`# HERO — 발전소 중지·재활성화 / 초대 무효화 / 교육 이력 보존 검증

> 2026-10-08 KST · `work/actions-paused-batch-20261008`  
> **CODE ONLY — STAGING NOT APPLIED — DB pgTAP, Deno, Vitest, Kakao E2E NOT RUN**

## 결정된 정책

- **운영 중지 = 교육 실행 정지이며, 삭제가 아님.** 발전소·프로필·교육 세션·감사 로그는 보존한다.
- 중지 후 발급되지 않은 과거 초대 링크는 다시 활성화해도 사용할 수 없다. 초대 발급 세대(`plants.invitation_epoch` / `invitations.plant_invitation_epoch`)가 다르면 무효화한다.
- 중지 시 담당자/Player의 신규 초대 발급·수락, Player 프로필 변경, 교육 시작·완료를 DB에서 거절한다. 서비스 역할 Edge도 발전소 `is_active`를 확인한다.
- 중지된 발전소의 담당자는 발전소 전체 조회·관리 범위를 잃는다. **활성 Player는 자신의 과거 교육 세션·결정·학습 요약에 대해서만 읽기 권한을 유지**하며 타인 기록은 볼 수 없다. 개인 계정 자체가 비활성화되면 과거 이력 열람도 차단한다.
- Admin은 중지·재활성화 전에 발전소 코드 재입력 및 영향 확인란을 체크해야 한다. 중지하면 운영 담당자와 Player에 영향이 있고, 기존 링크는 영구 무효화됨을 명시한다.

## 기존 비활성 발전소의 초기 보정

Migration 024를 처음 적용할 때, 이미 중지된 발전소의 기존 초대 링크도 `plant_invitation_epoch=0` 기본값을 갖는다. 이에 해당 발전소의 `invitation_epoch=1`로 초기 보정한다. **이 단계가 없으면 재활성화 시 이전 링크의 epoch 0이 맞아 우발적으로 다시 유효해질 수 있다.** 활성 발전소는 epoch 0으로 시작해 정상 초대를 보존한다.

이 보정은 실제 운영 DB에 아직 수행하지 않았다. 별도 빈 격리 DB에서 *Migration023까지 적용 후*, 비활성 발전소/과거 미수락 초대 fixture를 추가하고 Migration024를 적용하여 epoch 불일치 및 재활성화 후에도 사용 불가인지 확인해야 한다.

## 경계별 구현 파일

| 경계 | 파일 | 내용 |
|---|---|---|
| Migration | `supabase/migrations/202610080024_plant_deactivation_boundaries.sql` | 세대 초기 보정, 트리거, 활성 범위 RLS, 과거 이력 owner SELECT 정책, `my_record_summary` |
| Edge | `supabase/functions/_shared/supabase.ts` | 비활성 발전소의 Player/담당자 작업 사전 차단 |
| 초대 조회 | `supabase/functions/peek-invite/index.ts` | 비활성·epoch 불일치 사유 반환, DB 장애와 없는 토큰 구분, 내부 오류 미노출 |
| Admin UI | `apps/web/src/features/admin/AdminOrgPage.tsx`, `plantTransitionConfirmation.ts` | 코드 재입력·영향 동의, 위험한 상태 전환 직전 확인 |
| DB 검증 | `supabase/tests/plant_deactivation_epoch.test.sql` | **39개 pgTAP 선언** (DB 실행 전), 관리자 범위 차단, 구 링크 무효화, 교육 동결·재개, 본인 이력 owner 접근 |
| WEB 검증 | `apps/web/src/features/admin/plantTransitionConfirmation.test.ts` | 승인되지 않은 상태 전환 방지 (Vitest 미실행) |

 → `$`)를 수정했으며, 정적 게이트에 구분자 짝 검사를 추가했다.

## 재현 단계 (전부 NOT RUN)

1. 격리 PostgreSQL에 Migration001~023 순서 적용. 중지된 발전소, 당시 발급된 미수락 초대 링크를 사전 fixture로 구성한 뒤 Migration024 적용. 이전 링크 무효화 확인.
2. 같은 DB에서 신규 pgTAP **291개 선언**과 기존 정책 테스트 전체 실행. 중지/재활성화와 초대 발급/수락, session start/submit 동시성은 **두 연결 세션**에서 재현.
3. Admin UI: 중지 버튼 한 번으로 Edge 호출이 발생하지 않는지, 발전소 코드를 잘못 입력하거나 확인란을 선택하지 않으면 확정 버튼이 비활성인지 검증.
4. 중지된 담당자는 Dashboard RPC 및 초대·닉네임 Edge가 403인지 확인. 활성 Player 본인은 `play_sessions`, `session_decisions`, `my_record_summary`를 읽되 다른 Player 기록은 0건인지 확인.
5. `peek-invite`: DB 장애와 원래부터 없는 토큰, 이미 취소·수락·만료·세대 폐기된 토큰의 오류 상태를 구분하는지 점검.
6. 격리 검증 통과와 사용자 승인 이후에만 staging DB **Migration016→017→018→019→020→021→022→023→024** 적용, RPC/Edge/웹 동일 버전 배포, 실제 Kakao Admin→Manager→Player E2E.

## 정적 사전검사

`node scripts/check-batch-db-contracts.mjs`는 DB/네트워크 접근 없이 Migration024의 초기 세대 보정·owner RLS·초대 조회 오류 구분의 소스 계약을 추가 점검한다. **실제 PostgreSQL 원자성/SQL 런타임 테스트와 같지 않다.**

기존 총 신규 pgTAP 252개 + Migration024 39개 = **291개 선언**. SQL 파일 총 16개, 원자적 서비스 역할 RPC 8종.

**Actions 절약 정책을 유지한다. main·PR #79·Supabase 원격 DB·Edge·Cloudflare 배포를 변경하지 않는다.**
