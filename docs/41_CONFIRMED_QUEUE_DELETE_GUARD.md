# HERO — 서버 완료 영수증 확인 후 원자적 큐 삭제

> 2026-10-08 · work/actions-paused-batch-20261008 · T5-04 PARTIAL

## 문제
- 기존 cleanupConfirmedLocalSession은 서버 영수증을 저장하는 마커 writeQueueRecord가 실패하더라도 이어서 cached-session 및 queue 삭제를 시도하여, 기존 pending 선택 기록을 잃을 가능성이 있었다.
- 기존 removeQueuedSubmission은 userId, scenarioId, committed 상태, completionReceipt를 확인하지 않고 키 sessionId만으로 삭제했다.
- 동일 세션에 대해 여러 탭이 경합하는 경우 최신 행이 pending/타 사용자 행으로 변경된 뒤에도 오래된 삭제가 실행될 수 있었다.

## 수정
- submissionQueueDeletePolicy.ts: userId/scenarioId/sessionId와 완료 영수증을 모두 확인한 verified committed 행만 자동 삭제, absent는 idempotent no-op, 미확정/신원 불일치는 삭제 금지.
- submissionQueue.ts: removeQueuedSubmission(sessionId,userId,scenarioId)를 readwrite 트랜잭션에서 get→검증→delete 순서로 재구성했다. request callback 내 동기 검증으로 TOCTOU 간격을 제거했다.
- 영수증 마커 저장 실패 시 cleanupPending=true 반환 후 즉시 종료하여 pending 기록을 보존한다. 서버 완료 영수증은 UI에 유지하며, DB 멱등성 검증은 별도 요구된다.
- submissionQueueCommit.test.ts: pending 기록 마커 쓰기 실패 보존, 미확정 행 삭제 거부, 타 사용자 기록 삭제 거부 등 회귀 테스트 3개 추가. Mock 트랜잭션의 abort 이후 completion 이벤트도 보정.
- submissionQueueDeletePolicy.test.ts: 정책 경계값 6개 그룹 추가.

## 검증 상태
- 실제 TypeScript 정책 모듈과 기존 submissionReceipt.ts 기반 Node22 격리 테스트 10/10 PASS 및 tsc strict PASS.
- 전체 Vitest/실제 IndexedDB Safari/2개 탭/DB 멱등성/Playwright/Deno는 NOT RUN. 해당 테스트는 여전히 최종 릴리스 게이트다.
- 원격 main, PR #79, GitHub Actions, Supabase 및 Cloudflare 환경은 변경하지 않는다. 기존 진도 75.6%, T5-04 PARTIAL 유지.
