# HERO — 일회용 초대 응답 계약 및 운영자 결과 대조 검증

> 2026-10-08 KST · `work/actions-paused-batch-20261008`  
> **CODE COMMITTED / BATCH BRANCH ONLY / FULL VITEST & PGTEST NOT RUN / ACTIONS PAUSED / STAGING UNCHANGED**

## 적용 범위와 보안 원칙

1. 서버가 2xx 응답을 보냈어도 토큰 발급 트랜잭션이 어떤 초대에 적용되었는지 불확실할 수 있다. 응답 형식만으로 커밋 사실을 가정하지 않고 검증한다.
2. `readIssuedInviteLink`은 유효한 UUID `invitationId`, 절대 URL `inviteUrl`, 유효한 `expiresAt`, 비어 있지 않은 `plantDisplayName`을 요구한다.
3. URL은 운영 HTTPS(로컬 개발 loopback HTTP 허용)이며 경로가 `/i/{token}` 형식인지, token 이외 경로 segment·query·fragment·URL 자격증명이 없는지 검사한다.
4. `readReissuedInviteLink(response, requestedInvitationId)`은 `reissued=true`, `oldInvitationId===requestedInvitationId`, `new invitationId!==requestedInvitationId`를 요구한다. Admin·Manager가 같은 함수를 사용한다.
5. `readCanceledInviteResult(response, requestedInvitationId)`은 `canceled=true`, 동일 `invitationId`, 유효한 `canceledAt`을 요구한다. Admin·Manager가 같은 함수를 사용한다.
6. 잘못된 2xx 응답은 실패 확정이 아니라 **결과 미확정**으로 처리해 자동으로 새 초대를 발급·취소하지 않는다. 만료/분실된 토큰 원문은 DB에서 복원할 수 없다.
7. 모든 운영자 작업(초대/Player 상태/닉네임 강제 초기화)은 **정상 명단 재조회 → 사용자의 명시적 대조 완료** 순서 후 재시도 잠금을 해제한다.

## 계층별 계약 표

| 계층 | 구현 및 검증 대상 | 현재 상태 |
|---|---|---|
| PostgreSQL | 원자적 초대 생성/재발급/취소 및 감사, 016~023 migration | 코드 작성, 실제 pgTAP NOT RUN |
| Edge | create-invite, manager-user-action, nickname-action의 DTO/오류 상태 | 소스 연결 검토, Deno 전체 NOT RUN |
| Browser | `inviteResponse.ts` 공통 생성/재발급/취소 검증기 | 브랜치 구현 |
| Admin | `AdminOrgPage.tsx` 목록 재조회, 2단계 해제 및 링크 보존 | 브랜치 구현 |
| Manager | `ManagerDashboardPage.tsx`·`ManagerInvitePanel.tsx` 확인·중복 방지 | 브랜치 구현 |
| QA | `inviteResponse.test.ts` 정상/오류·다른 초대 ID/URL 검사 | 작성 완료, 전체 Vitest NOT RUN |

## 검증해야 할 대표 사례

| ID | 상황 | 기대 결과 | 상태 |
|---|---|---|---|
| RESP-01 | 유효한 생성 HTTPS URL, UUID, ISO 만료일 | 표시 가능 | NOT RUN |
| RESP-02 | 재발급 시 `oldInvitationId`가 요청 ID와 다름 | 결과 미확정·잠금 | NOT RUN |
| RESP-03 | 재발급 응답의 신규 ID가 기존과 동일 | 잘못된 토큰 회전으로 거절 | NOT RUN |
| RESP-04 | 취소 응답의 ID 불일치 또는 취소 시각 손상 | 성공으로 처리하지 않음 | NOT RUN |
| RESP-05 | URL `http://external`, credentials, query, fragment, 다른 경로 | 초대 결과로 수락하지 않음 | NOT RUN |
| RESP-06 | 운영 HTTPS, 개발 loopback HTTP | 올바른 링크 표시 | NOT RUN |
| RESP-07 | DB 커밋 후 HTTP 응답 유실 | 새로운 초대 자동 발급/재시도 금지 | NOT RUN |
| RESP-08 | 명단 재조회 실패/null/불완전한 행 | 잠금 유지 | NOT RUN |
| RESP-09 | 명단 조회 성공, 운영자가 아직 확인하지 않음 | 잠금 유지 | NOT RUN |
| RESP-10 | 명단 정상 조회 및 운영자 명시적 확인 | 잠금 해제 | NOT RUN |
| RESP-11 | Player 상태 변경 또는 닉네임 초기화의 응답 유실 | 같은 2단계 확인 정책 적용 | NOT RUN |

## 안전한 검증·배포 순서

1. 배치 브랜치 복제본에서 `pnpm check:batch-db-contracts`, `pnpm --dir apps/web typecheck`, `pnpm --dir apps/web test`, `deno test`를 실행하고 결과를 기록한다.
2. 격리 PostgreSQL에서 migration 001~023, pgTAP 신규 252 assertion 포함 전체 정책 테스트와 동일 초대에 대한 accept/cancel/reissue 동시성을 점검한다.
3. 운영 DB 적용 승인 전에는 Supabase migration 016→017→018→019→020→021→022→023 적용 금지.
4. 승인·검증 후에만 staging DB → RPC grants → Edge → 웹 배포 순으로 진행한다.
5. Kakao 실계정 Admin→Manager→Player E2E 및 S03 시나리오의 사람 검토는 별도 출시 게이트로 유지한다.

후속 Admin 발전소 감사·권한 게이트는 `docs/27_ATOMIC_ADMIN_PLANT_VALIDATION.md` 참고.

이번 세션에서는 `main`, PR #79, 원격 Supabase, Cloudflare 배포, GitHub Actions에 변경을 가하지 않았다.
