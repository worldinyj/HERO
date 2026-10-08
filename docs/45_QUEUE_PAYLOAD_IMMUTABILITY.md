# HERO — T5-04 오프라인 큐 행동 로그 불변성과 수동 재시도

2026-10-08 | work/actions-paused-batch-20261008 | T5-04 PARTIAL

## 발견한 결함
- 브라우저 탭별로 같은 세션 ID의 제출 행동 로그가 서로 달라도 writeQueueRecord가 무조건 put 할 수 있었다. 늦은 탭의 재전송으로 실제 선택·반성 응답을 덮어쓸 위험이 있다.
- 서버 영구 거절로 blocked된 행도 일반 offline/enqueue 경로의 자동 pending 갱신으로 부활할 수 있었다.
- 오래된 retry metadata의 put이 더 높은 attempts 값을 낮출 수 있었다.

## 변경
- submissionQueueWritePolicy.ts: 같은 세션/사용자/시나리오 고정, 동일 actions(type/actionId/cardId) 및 reflectionAnswered/swissCheeseViewed 확인. 불일치면 payload_conflict 예외로 원본 보존.
- blocked→pending은 allowBlockedRetry=true 옵션이 전달된 수동 재시도 경로에서만 허용. 자동 enqueue는 blocked 상태를 보존한다.
- 기존 pending 기록의 attempts가 더 크면 오래된 쓰기를 no-op으로 처리한다. 검증된 committed 서버 영수증은 횟수에 우선한다.
- submitSessionWithQueue는 기존 blocked 행을 서버에 자동 재전송하지 않고 상태 메시지를 반환한다. 플레이 화면에서는 별도 안내와 비활성 재시도 버튼 표시.
- retryBlockedSubmission만 writeQueueRecord에 allowBlockedRetry 플래그를 전달한다.
- 정책 Vitest 7건 추가 및 기존 blocked 전환 테스트 갱신. 모의 통합 Vitest 4건 추가.

## 검증 및 한계
- policy의 격리 TypeScript 컴파일 및 Node22 경계 시험 **18/18 PASS**. 실제 앱 전체 Vitest, 브라우저 2탭, 저장소 재접속, Supabase DB 동시성 검증은 **NOT RUN**.
- 브라우저 앱에 명시적인 blocked 수동 재시도 UI를 연결하는 작업은 남음. 임시로 일반 자동 재시도를 막고 담당자 확인 안내를 표시.
- 다른 기기 간 중복 방지에는 서버 DB의 원자적 완료 RPC 멱등성 시험이 필요.
- main/PR #79/GitHub Actions/Supabase 원격 DB/Cloudflare 미변경. 기존 Tasklist 가중 진도 75.6% 및 T5-04 PARTIAL 유지.
