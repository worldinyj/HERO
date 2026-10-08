# HERO — 완료 세션과 동일한 캐시만 조건부 정리

> 2026-10-08 | Branch work/actions-paused-batch-20261008 | T5-03 PARTIAL

## 발견 및 변경
- 백그라운드 큐가 성공한 뒤 competitive-sessions 캐시는 정리되지 않았다. 화면의 기존 무조건적 clearCompetitiveSession은 다른 탭의 신규 replay를 삭제할 수 있었다.
- competitiveCleanupPolicy.ts: formatVersion, key, userId, scenarioId, server.sessionId가 모두 일치할 때만 삭제하도록 식별자를 비교한다.
- competitivePersistence.ts: 단일 IndexedDB readwrite transaction에서 해당 캐시를 get→확인→delete한다. 새로운 replay는 삭제하지 않는다.
- submissionQueue.ts: 전면 제출과 큐 flush가 서버 확정 영수증을 받은 뒤 queue와 competitive cache를 각각 best-effort로 정리한다.
- CompetitiveGamePage.tsx: 성공 후 경쟁 플레이 캐시의 무조건적 삭제를 제거한다.
- submissionQueueCommit.test.ts: 모의 IDB get/delete를 보강하고 완료 세션 일치, 다른 탭 신규 replay 보존, background flush, 삭제 실패 사례를 추가한다.
- competitiveCleanupPolicy.test.ts: 식별자 일치/불일치 테스트 4건을 추가한다.

## 검증
- Node22 순수 정책 모듈 8/8 PASS, standalone TypeScript strict PASS.
- 실제 IndexedDB 트랜잭션/전체 Vitest/브라우저 E2E/DB pgTAP/실기기 테스트 미실행.
- 서로 다른 기기는 Web Locks로 보호되지 않으므로 서버 complete_play_session_atomic의 원자성 및 멱등성 실검증 필요.
- main, PR #79, Actions, Supabase staging/prod, Cloudflare 변경 금지 유지. Tasklist 진도 75.6%, T5-03 PARTIAL.
