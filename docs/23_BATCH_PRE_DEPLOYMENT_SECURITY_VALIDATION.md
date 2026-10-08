# HERO 일괄검증 전 보안·입력·테스트 데이터 점검 (2026-10-08)

> 대상: `work/actions-paused-batch-20261008` | **Actions PAUSED / DB MIGRATION 016~022 NOT APPLIED / RELEASE BLOCKED**

## 정적 검증 범위

- `scripts/check-batch-db-contracts.mjs`: 추가 pgTAP 9개 파일의 선언/plan 일치(218항목), 016~022 migration 범위, RPC 6개 서비스 역할 격리 및 Edge 연결 점검.
- 전체 pgTAP SQL 파일 14개를 스캔하여 **테스트 파일 간 고정 UUID 중복 및 auth.users 이메일 중복**을 거절. 기존 `admin_bootstrap.test.sql`의 발전소 UUID와 `season_rollover.test.sql`의 시즌 UUID를 각자 고유 prefix로 변경. 기존 두 UUID는 서로 다른 테이블에 있었으므로 실제 PK 충돌이었다는 의미는 아니고, 향후 테스트 독립성을 강화하는 예방 조치이다.
- 정적 교차 검사 당시 14개 파일, 고정 UUID 127개, fixture 이메일 59개가 각각 **중복 0건**. 실제 psql/pgTAP 실행 결과는 아니다.

## Edge 사전 입력 거절

- `_shared/uuid.ts`: REST 경로로 받은 요청의 UUID를 JSON 값의 실제 타입까지 검증. manager-user-action 취소/재발급/Player 상태 변경, create-invite 발전소 ID, nickname-action 강제 초기화 대상 ID에 적용.
- `_shared/jsonObject.ts`: 잘못된 JSON/빈 요청/primitive/배열/null 입력을 **400 invalid_request**로 확정 거절. 서비스 RPC 실행 전에 차단.
- `create-invite`의 `plantId`, `inviteeName`, `teamName`, 역할, Player 직무 enum을 사전 검증. `nickname-action`의 nickname 문자열과 강제 초기화 UUID도 타입 검증.
- CI에는 `uuid.test.ts`, `jsonObject.test.ts`의 Deno 테스트 명령을 등록하되, **현재 Actions 실행은 0건**.

## 취소·재발급 결과의 2단계 대조 확인 및 오류 분류

- `ManagerDashboardPage.tsx`: 취소 또는 재발급 응답이 사라지면 관련 초대 취소/재발급을 모두 잠금. 서버 목록 재조회가 성공해야 두 번째 단계 버튼이 활성화되며, 사용자가 실제 수락 대기 명단을 대조하고 확인을 눌렀을 때만 잠금 해제.
- `managerDashboardResponse.ts`: 참여자/초대/집계 RPC 목록이 모두 배열이며 필수 필드의 타입이 올바른지 확인. 손상된 결과로 잠금이 잘못 풀리는 경로 차단. `managerDashboardResponse.test.ts` Vitest 4개 작성.
- `invitationErrorStatus.ts`: plain PostgREST `{code:"P0001",message:"..."}` 객체도 정확한 allowlist 메시지만 4xx로 분류하고, 상세 DB 오류/상속된 property/임의 accessor는 노출하지 않음. Deno.test 2그룹 추가.
- **실제 전체 Deno, Vitest, 브라우저 E2E는 NOT RUN**. 이 변경은 현재 GitHub 배치 브랜치에만 적용됐고 원격 DB/Edge/웹은 변경되지 않았다. `docs/24_INVITATION_OUTCOME_RECONCILIATION_VALIDATION.md`에서 개별 게이트 관리.

## 수행 증거 및 미수행 게이트

| 검사 | 상태 |
|---|---|
| 실제 GitHub 파일의 고정 UUID 127개 / 이메일 59개 중복 비교 | 정적 확인 PASS |
| 신규 입력검증 단위 테스트 4개 그룹 Node22 Deno.test shim 격리 실행 | PASS (Deno 자체가 아님) |
| Migration 016~022 추가 pgTAP 선언 218개 / 새 RPC 6개 정적 연결 | 정적 확인 PASS |
| 신규 `check:batch-db-contracts` Node 정식 실행 (전체 저장소 파일 필요) | NOT RUN |
| Deno test/check, 전체 pnpm 테스트/빌드, PostgreSQL pgTAP | NOT RUN |
| 동시 트랜잭션, Supabase Staging migration/Edge, 실제 Kakao E2E | NOT RUN |

## 이후 실행 순서

1. GitHub Actions 비용/실행 허용 확인 전까지 기존 PR/#79와 main을 변경하지 않는다.
2. 최종 통합 브랜치를 로컬로 내려받아 `node scripts/check-batch-db-contracts.mjs`, `deno test`, `pnpm typecheck/test/build` 실행.
3. 빈 격리 PostgreSQL 환경에서 Migration 001~022를 순서대로 적용하고 모든 pgTAP SQL을 실행한다. 추가로 동일 Player 동시 닉네임 변경·상태 변경을 두 DB 세션으로 검증.
4. 오류 없이 끝나고 사용자 승인 후에만 DB 016~022를 Staging에 적용한 다음 Edge 함수를 배포하며, Player/Kakao/Admin/Manager 실제 E2E를 수행한다.
