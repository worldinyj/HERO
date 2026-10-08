# HERO — Admin·담당자 초대 / Player 닉네임 결과 정합성 추가 검증

> 2026-10-08 KST · `work/actions-paused-batch-20261008`  
> **BATCH CODE ONLY / GitHub Actions NOT RUN / STAGING DB & EDGE UNCHANGED / RELEASE BLOCKED**

## 수정 범위

1. `apps/web/src/features/profile/ProfilePage.tsx`, `nicknameReconciliation.ts`: 최신 입력과 일치하는 닉네임 availability 결과만 표시·사용. `nickname-action.status`와 `my_record_summary` 데이터 구조 검사. 미확정 변경 후 재조회 결과가 null/손상/서로 다른 닉네임을 반환하면 재시도 잠금 유지. 열린 시즌이 없는 경우 `canChange=false` 정책 적용.
2. `apps/web/src/features/manager/ManagerInvitePanel.tsx`: 단건 초대 및 CSV 일괄 초대가 결과 불명 시 서버 수락 대기 명단을 정상 조회하고 운영자가 명시적으로 확인하기 전까지 재요청/새 목록 시작 차단. 이미 발급된 일회용 URL은 계속 보여줌.
3. `apps/web/src/features/manager/inviteResponse.ts`: 성공 HTTP 2xx라도 `invitationId`, `inviteUrl`, `expiresAt`, `plantDisplayName` 필수 필드·절대 HTTP(S) URL·날짜가 유효하지 않으면 `InviteCreationOutcomeUnknownError`를 통해 재시도 잠금 처리. 잘못된 자료가 자바스크립트 예외로 빠져 단순 실패 취급되는 문제 제거.
4. `apps/web/src/features/admin/AdminOrgPage.tsx`, `adminOrgResponse.ts`: Admin 목록 3종(발전소/담당자/대기 초대)의 배열 및 필수 필드 검증; 서버 조회 실패와 완료 결과를 명확히 구분. 담당자 초대 생성·재발급·취소 응답 미확정을 각각 추적, 사용자 2단계 명단 대조 후 잠금 해제. 보관하지 않은 1회용 링크의 무의도 삭제 방지.

## 격리 검사 (GitHub 브랜치와 동일한 순수 TS 소스 대조)

| 분류 | 검사 | 결과 |
|---|---|---|
| `nicknameReconciliation.ts` | strict `tsc` 및 Node22 로직 36조건 | PASS |
| `inviteResponse.ts`, `adminOrgResponse.ts` | strict `tsc` 및 Node22 로직 42조건 | PASS |
| 세 순수 모듈과 GitHub 브랜치의 텍스트 길이·FNV32 해시 | 소스 동일 확인 | PASS |
| 신규 웹 Vitest 테스트 파일 3개 | 작성 완료 | NOT RUN |
| 전체 웹 `pnpm typecheck`, `pnpm test`, 브라우저 E2E | 전체 앱 의존성 필요 | NOT RUN |
| Deno Edge 및 migration 016~022 pgTAP 218개 | 별도 격리 환경 필요 | NOT RUN |
| Kakao 실계정 Admin→Manager→Player 시나리오 | 배포 후 사용자 승인 필요 | NOT RUN |

**위 PASS는 순수 함수의 격리 검증에 한정됩니다.** 관리자/담당자 React 화면 동작과 실제 저장소 전체 타입 검사는 완료된 것이 아닙니다.

## 주요 수동 회귀 시나리오

- [ ] Player 입력 변경 직후 이전 이름의 확인 성공 응답이 지연 도착하면 변경 버튼이 비활성화되는지 확인
- [ ] Player 변경 후 프로필·정책 재조회 중 한쪽이 실패하면 미확정 상태가 유지되는지 확인
- [ ] 단건 초대 및 CSV 중단의 미확정 요청에서 목록 조회 실패·손상 응답 시 재시도 차단 확인
- [ ] Admin 생성/취소/재발급에서 서버 5xx 또는 응답 유실 후 재조회와 명시적 확인이 두 단계로 동작하는지 확인
- [ ] 초대 링크 보관 전 해당 링크 취소 클릭 시 원문 URL이 지워지지 않는지 확인
- [ ] 정상 DB migration/Edge 배포 이후 초대 이력·감사 일관성과 권한 경계 확인

## 공통 서버 응답 검증 및 Player 상태 확인

- 초대 생성은 초대 ID의 UUID 형식 및 일회용 URL의 HTTPS/loopback, `/i/{token}` 형태, 만료시각·필수 문자열 존재 여부를 확인한다.
- 재발급은 `reissued=true`, `oldInvitationId`와 요청한 ID의 일치 및 새로운 다른 초대 ID를 확인한다.
- 취소는 `canceled=true`, `invitationId` 일치, `canceledAt`의 날짜 형식까지 확인한다.
- Admin·Manager가 같은 브라우저 공통 검증기를 사용한다. Player 상태와 닉네임 초기화 역시 명단 재조회만으로 잠금을 풀지 않고 사용자가 확인해야 한다.
- 상세 내용과 미실행 회귀 테스트: `docs/26_INVITATION_RESPONSE_CONTRACT_VALIDATION.md`.

## 배포 순서

CI 사용 허가와 로컬 검증 통과 후에만 **migration 016→017→018→019→020→021→022 적용 → RPC grants 점검 → Edge Functions/웹 동시 배포 → 실제 Admin/Manager/Player E2E** 순서를 따른다. `main`, Draft PR #79, 원격 DB/Edge, Cloudflare staging은 미변경.
