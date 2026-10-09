# HERO — 서버 제출 확정 후 IndexedDB 정리 실패 보호

> 2026-10-08 | work/actions-paused-batch-20261008 | T5-03 PARTIAL | NO DEPLOYMENT

## 발견된 결함
서버가 해당 sessionId의 원자적 완료 영수증을 응답한 후 IndexedDB의 submission-queue.delete 또는 competitiveSession 정리에 실패하면, 이전 화면은 커밋 완료를 오류로 오해하거나 조용히 무시했다. 재연결 시 stale row가 다시 제출될 수도 있으므로 서버가 멱등성을 보장해야 한다.

## 구현
- submissionCleanup.ts: 서버 확정 **이후**만 사용되는 best-effort 기기 기록 정리. 실패는 cleanupPending=true로 돌려주고 예외를 제출 실패로 전파하지 않는다.
- submissionQueue.ts: foreground 완료 결과에 cleanupPending을 포함한다. queue flush 성공 시 delete가 실패해도 서버 완료건 submitted로 집계하며 큐 행은 후속 멱등 재전송을 위해 남는다.
- CompetitiveGamePage.tsx: 서버 완료 안내를 유지하고 기기 정리 지연을 별도로 표시한다. 로컬 competitive 세션 clear 실패 역시 완료 취소로 보지 않는다.
- 동일 세션의 중첩 UI 제출은 in-flight ref 및 완료상태로 차단해 늦은 응답이 성공 화면을 대기 상태로 덮어쓰지 않게 한다.
- submissionCleanup.test.ts: 정상/비동기 오류/동기 오류/재시도 4개 테스트.
- submissionQueueCommit.test.ts: Supabase invoke 및 IndexedDB 시뮬레이터를 통한 foreground cleanup 실패/성공, queue flush 삭제 실패 3개 테스트.

## 검증 및 정책
- Node 22 격리 모듈 테스트 4/4 PASS, TypeScript helper strict check PASS. 실제 Vitest 7개 신규 테스트는 코드에 포함되었지만 **미실행**.
- 저장소 전체 typecheck, Playwright E2E(2탭, 360px/390px), iOS/Samsung Internet, Supabase Edge/Deno, pgTAP 295 assertions, staging migrations 016–024 **미실행**.
- 서버 영수증이 없거나 데이터가 잘못되면 **절대** 확정 처리하지 않는다. 확정 이후에도 IndexedDB 삭제 실패 시 이전 큐가 남아 있을 수 있으므로 DB 완료 API의 멱등성 검증이 최종 게이트다.
- main, PR #79, GitHub Actions, Supabase 원격 DB, Cloudflare 배포 변경 없음. 진도율 75.6%는 유지하고 T5-03은 PARTIAL.
