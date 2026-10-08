# HERO Migration 019 — 신규 초대 생성/감사 원자성 검증

> 2026-10-08 KST · `work/actions-paused-batch-20261008`  
> **CODE WRITTEN · LOCAL pgTAP NOT RUN · STAGING NOT APPLIED**

## 문제와 해결 코드

이전 `create-invite` Edge Function은 새 초대 DB INSERT 후 별도의 감사 INSERT를 수행했다. 감사 서비스 오류 발생 시 초대가 발급되어도 호출자는 500을 받고 링크를 확인할 수 없었다. 신규 `public.create_invitation_atomic`는 두 DB INSERT를 한 트랜잭션에 묶는다.

- `supabase/migrations/202610080019_atomic_invitation_creation.sql`
- `supabase/functions/create-invite/index.ts` (신규 RPC 1회 호출)
- `supabase/tests/invitation_atomic_creation.test.sql` (27개의 독립 pgTAP assertion 작성)
- `apps/web/src/features/manager/ManagerInvitePanel.tsx` (단건 일회용 링크 저장 완료 전 새 발급 버튼 잠금)

DB 함수 내에서 활성 프로필과 actor-role을 재검증한다. Admin은 발전소담당자만, 담당자는 자기 발전소 Player만 발급 가능하다. `public.plants`에서 활성 발전소만 허용하며 트랜잭션 동안 `FOR SHARE` 잠금으로 비활성화와의 경쟁을 제어한다.

위험한 원문 토큰은 **DB에 저장하지 않으며** 해시만 저장. `SITE_URL`은 DB 호출 전에 검증한다. 함수는 `SECURITY DEFINER`이므로 `PUBLIC`, `anon`, `authenticated` 실행권한을 해제하고 `service_role`에만 명시적으로 허용한다.

## 테스트 항목

| 내용 | 테스트 근거 | 상태 |
|---|---|---|
| 직접 RPC 접근 제한 및 service role 권한 | pgTAP | NOT RUN |
| Admin 담당자 초대와 Manager 동일 발전소 Player 초대 | pgTAP | NOT RUN |
| 타 발전소·다른 역할·비활성 담당자 차단 | pgTAP | NOT RUN |
| 비활성 발전소·잘못된 직무/만료·비어 있는 이름 차단 | pgTAP | NOT RUN |
| 원문 대신 해시 저장 및 발급 감사 1건 | SQL 쿼리·정적 코드 | NOT RUN |
| 중복 해시 SQLSTATE 23505 시 중복 기록 없음 | pgTAP | NOT RUN |
| **감사 로그 실패주입 시 invitation INSERT 롤백** | pgTAP fault injection | NOT RUN |
| Admin/Manager 단건 링크 자동 덮어쓰기 차단 | 웹 브라우저 E2E | NOT RUN |
| 통신 단절 후 발급 결과 불확실성 처리 | 브라우저 + Edge Function | NOT RUN |
| Edge Function Deno 타입검사 | `deno check --config supabase/functions/deno.json supabase/functions/create-invite/index.ts` | NOT RUN |

## Edge 오류 상태 계약 추가

- `supabase/functions/_shared/invitationErrorStatus.ts`: DB 또는 권한 검증의 알려진 거절만 4xx로 변환하고, 예상치 못한 PostgreSQL 오류·DB 응답 지연·결과 누락 등은 `500 internal_error`로 유지.
- `create-invite`, `manager-user-action` 모두 공통 변환을 사용하여 일부 DB 거절에 500을 반환하던 문제 수정.
- `invitationErrorStatus.test.ts` Deno 단위 테스트 코드 추가; CI의 향후 일괄 검사에만 등록. **Deno runner NOT RUN** (Node22에서 동일 TS 테스트를 shim으로 격리 실행 2/2 PASS, TypeScript standalone strict + noUncheckedIndexedAccess PASS).
- 불확실한 500은 이미 처리되었을 수 있으므로 프런트의 재발급 중지·대조 플로우 유지.

## 누적 DB 계약 점검

- Migration 016: 43 assertions
- Migration 017: 21 assertions
- Migration 018: 27 assertions
- Migration 019: 27 assertions

**총 118개 작성**. 실제 PostgreSQL/pgTAP 실행에 따른 성공은 아직 0건이 아니라 **NOT RUN**으로 표기해야 한다.

## 적용 순서 (승인 전 실행 금지)

1. 로컬 DB에서 001~015 및 016→017→018→019→020 순서대로 적용한 뒤 `supabase test db` 전체 검사.
2. Deno 타입검사·웹 앱 단위 테스트·컴파일 및 실제 독립 트랜잭션 경쟁 테스트 수행.
3. 검증 통과 및 별도 승인 후 staging DB migration016→017→018→019→020 적용.
4. 새 생성·취소·재발급 RPC의 service_role grant 확인.
5. Edge Function `create-invite` 및 `manager-user-action`, 웹앱을 동일 릴리스 버전으로 배포.
6. 실제 Kakao Admin→Manager→Player 발급/수락/재발급/취소 E2E 확인.
7. S03 시나리오 사람 승인, 법무·개인정보·출시 증거 등의 남은 게이트는 별도로 평가.

배치 모드에서는 이 문서를 검증 준비자료로만 사용한다. GitHub Actions/원격 DB/실사용자 데이터는 변경하지 않는다.
