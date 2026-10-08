# HERO — 동일 세션 중복 제출 / 오프라인 큐 경쟁 상태 보호

> 2026-10-08 · `work/actions-paused-batch-20261008`
> **BATCH CODE COMMITTED / ISOLATED Node22 SERIAL TEST 3/3 PASS / FULL VITEST, DB, E2E NOT RUN**

## 원인

기존 구현은 `submitSessionWithQueue`와 `runFlush`가 서로 독립적으로 같은 세션을 전송할 수 있었다. 예를 들어 직접 제출이 완료되어 IndexedDB 행을 삭제한 후 이전 큐 flush의 실패 경로가 `updateAttempt`로 오래된 기록을 다시 저장하거나, flush가 이미 전송한 대기 기록에 대해 직접 제출이 별도 호출을 시작할 수 있었다. 로그인 사용자가 바뀐 직후 시작된 과거 사용자의 flush도 보호할 필요가 있었다.

## 변경

- `apps/web/src/lib/submissionSerial.ts`: 동일 브라우저 JavaScript 컨텍스트 안에서 **(userId, sessionId)** 단위로 전송 및 IndexedDB 기록 변경을 순차 실행한다. 앞선 동작 실패 시에도 후속 작업이 멈추지 않으며 다른 사용자·세션은 독립적이다.
- `submissionQueue.ts`: 전면 제출 및 오프라인 flush 모두 위 직렬화 함수를 사용한다.
- flush는 잠금 취득 *후* 대기 기록을 재조회한다. 다른 경로가 성공하여 기록을 삭제했거나 blocked로 바꿨으면 **옛 스냅샷으로 서버 재호출/행 재생성을 하지 않는다**.
- 재전송 직전 현재 Supabase 인증 계정이 큐 소유자와 다르면 전송하지 않고 대기 기록을 보존한다.
- 직접 제출에서 400/403/409 영구 거절을 받았고 이전 오프라인 기록이 있으면 해당 기록을 `blocked`로 전환하여 사용자 확인 전 자동 재시도하지 않는다.
- 신규 Vitest: 같은 세션 대기 순서, 앞선 실패 후 복구, 다른 사용자/세션 독립성 3개 테스트.

## 확인된 것과 확인되지 않은 것

- **격리 Node22 순수 모듈 동작 3/3 PASS**: 동일 TS helper를 Node 타입 제거 모드로 직접 실행. 다만 이는 전체 앱 Vitest가 아니다.
- **NOT RUN**: 전체 `pnpm --dir apps/web test`/typecheck/lint/build, 실제 IndexedDB·2개 브라우저 탭 동시 제출, 실제 Supabase Edge/PostgreSQL 세션 완료, Playwright 오프라인→재접속 E2E.
- JavaScript 메모리 잠금은 **탭 간·서로 다른 기기 간 중복 전송을 막는 분산 락이 아님**. 최종 원자성은 `complete_play_session_atomic`와 DB 실검증에 의존하며, IndexedDB 교차 탭 레이스는 남은 검증 항목이다.

## 다음 검증 게이트

1. 앱 단위: `pnpm --dir apps/web test -- submissionSerial.test.ts submissionQueue.test.ts submissionReceipt.test.ts`.
2. 360px/390px Playwright: 완료 응답 직후 foreground submit + queue flush 경쟁, IndexedDB 삭제 실패, 400/409 후 blocked 보존, 다른 Kakao 계정으로 전환했을 때 이전 계정 큐 보존.
3. 두 탭에서 동일 sessionId 전송, 네트워크 유실 후 서버 alreadyCompleted 수신, 발전소 중지→복구 시 `plant_inactive` 영속 큐.
4. 격리 PostgreSQL에서 동시 `complete_play_session_atomic` 완료에 대한 결과/점수/결정 로그 불변성 재검증. DB 016~024 staging 적용 및 승인 금지.

**Tasklist T5-03은 부분 구현, 전체 코드 진도 75.6%를 유지한다. main/PR #79/Actions/원격 Supabase/Cloudflare 미변경.**
