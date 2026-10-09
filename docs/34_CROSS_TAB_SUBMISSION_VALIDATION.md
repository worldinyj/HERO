# HERO — 교차 탭 제출/오프라인 수동 재시도 보호

> 2026-10-08 · work/actions-paused-batch-20261008 · CODE ONLY / RELEASE BLOCKED

## 문제 및 변경
- 이전 promise lock은 단일 탭에서만 동작하므로 동일 origin의 다른 탭이 같은 IndexedDB 큐를 동시에 읽고 쓰는 문제가 남았다.
- submissionSerial.ts: native navigator.locks.request(exclusive)로 사용자 ID+세션 ID별 교차 탭 잠금을 추가했다. 지원하지 않는 환경에서는 탭 내부 직렬화만 유지한다.
- 잠금 획득 실패 시 작업을 임의로 실행하지 않고 실패시킨다. 다른 기기/다른 출처에는 잠금이 적용되지 않으므로 DB 원자성은 필수다.
- submissionQueue.ts: retryBlockedSubmission이 최신 큐 행과 인증 사용자 일치를 잠금 내부에서 검증한다. 잠금을 해제한 뒤 후속 flush를 호출해 중첩 잠금을 방지한다.
- submissionSerial.test.ts: 독립 탭 시뮬레이션·타 세션 독립성·잠금 실패·미지원 fallback 4건 추가(기존 3건 유지).

## 확인 및 대기
- Node22 순수 모듈 격리 실행 6/6 PASS 및 standalone TypeScript strict PASS. (프로젝트 전체 Vitest 검증이 아님.)
- 전체 Vitest, Playwright 2개 탭/모바일 360·390, 실기기 iOS Safari·삼성 인터넷, DB complete_play_session_atomic 동시성, Deno 및 staging 검증 NOT RUN.
- XSUB-01 Tab A 직접 제출+Tab B flush 동시: 같은 세션 네트워크 처리가 동시에 일어나지 않아야 한다.
- XSUB-02 Tab A 성공 삭제+Tab B 큐 snapshot: 최신 큐 행 재조회로 재전송/복원 금지.
- XSUB-03 Tab A blocked 수동 재시도+Tab B 성공 삭제: 과거 blocked 행 복원 금지.
- XSUB-04 Web Lock 획득 거부: 작업 실행 금지, 로컬 기록 보존.
- XSUB-05 로그인 계정 변경 후 다른 사용자의 큐: 제출하지 않음.
- XSUB-06 다른 브라우저/기기의 동일 session: DB idempotency 및 서버 영수증으로 확인.

## 운영 정책
main, PR #79, GitHub Actions, 원격 Supabase, Cloudflare 배포는 변경하지 않는다.
T5-03은 부분 구현 유지. MVP Tasklist 코드 진행률 75.6%, 출시 준비율과 구별한다.
