# HERO — 초대 취소·재발급 응답 불확실성 검증 (2026-10-08)

> Branch: `work/actions-paused-batch-20261008`  
> **IMPLEMENTED IN BRANCH / CI PAUSED / STAGING UNCHANGED / RELEASE BLOCKED**

## 수정 이유

초대 취소/재발급의 DB 처리가 commit된 뒤 네트워크 응답이 유실되면, 사용자는 실제 상태를 모른 채 동일 작업을 재실행할 수 있다. 이전 취소 화면은 확정 불가능한 결과를 잠그지 않았으며, 재발급 화면은 서버 명단을 갱신하지 않고도 수동 잠금을 해제할 수 있었다. 재발급에 사용된 일회용 token은 DB의 해시값에서 복원할 수 없다.

## 구현

- `apps/web/src/features/manager/ManagerDashboardPage.tsx`: `uncertainCancellations`와 `uncertainReissues`로 대상 초대를 추적. 어느 한 쪽이 불확실해도 취소·재발급 양쪽 버튼을 차단. 네트워크 5xx, 응답 손상, 취소 commit 후 조회 실패 시 잠금 유지.
- 해제 절차: **① 서버 참여자·초대·집계 RPC 명단 재조회 → ② 사용자가 갱신된 명단을 실제 대조하고 확인 버튼으로 잠금 해제**. 재조회에 실패하면 ② 버튼은 계속 비활성.
- `managerDashboardResponse.ts`: 조회 결과 3종 모두 정상 배열·필수 필드 타입인지 검사. 빈 배열은 합법이지만 `null`, 비배열, 필수값 누락은 거절.
- `managerDashboardResponse.test.ts`: 빈/정상/손상된 목록의 Vitest 회귀 사례 4개 정의.
- `supabase/functions/_shared/invitationErrorStatus.ts`: PostgREST의 구조화된 `P0001` 오류 객체도 정확한 도메인 거절 코드로만 분류. `SQLSTATE 23505`, 원문 DB 오류·접근자 속성·프로토타입 오염은 500으로 가림. `invitationErrorStatus.test.ts` Deno 테스트 2그룹 추가.

## 수행할 검증

| 케이스 | 기대 결과 | 상태 |
|---|---|---|
| 서버에서 이미 취소 commit, 클라이언트 응답 유실 | 취소/재발급 중복 요청 차단 | NOT RUN |
| RPC 재조회 중 transport 오류 또는 `null` 반환 | 해제 단계 비활성 및 잠금 유지 | NOT RUN |
| 유효한 목록 재조회만 완료, 사용자 확인 전 | 두 작업 모두 잠금 유지 | NOT RUN |
| 명단 조회 성공 및 사용자 확인 후 | 두 작업만 잠금 해제, 링크 보관 보존 | NOT RUN |
| 초대 재발급 후 URL 원문 회수 불가 | 원문 복구 약속 없음, 수동 대조 | NOT RUN |
| PostgREST `P0001` 명시 거절 | 올바른 403/404/409 응답만 전달 | NOT RUN |
| 기타 SQLSTATE, accessor/getter 오류 | 500 internal_error, SQL 세부정보 미노출 | NOT RUN |
| Web Vitest, Deno test, 브라우저 Kakao E2E | 관련 regression 모두 PASS 필요 | NOT RUN |

## 배포 게이트

Migration 016~022 실제 DB 검증 및 적용을 마친 후에야 `manager-user-action`, `create-invite`, `nickname-action` Edge/웹을 호환 버전으로 배포한다. `main`, PR #79, 원격 Supabase DB, 현재 Cloudflare staging, GitHub Actions를 이번 작업에서 변경하지 않는다.
