# HERO — 제출 시작 시 구형 목록 조회 제거 및 시나리오 바인딩 보장

2026-10-08 | T5-04 PARTIAL | `work/actions-paused-batch-20261008`

## 확인된 문제
- `submitSessionWithQueue`는 초기 getAll(userId) 결과를 참조해 committed/blocked 행을 반환하거나 정리하고, 그 뒤 다시 readwrite 스테이징 트랜잭션으로 동일 세션을 검사했다. 목록 조회는 다른 탭 작업에 따라 낡을 수 있고 불필요한 중복이다.
- 특히 동일 sessionId인데 다른 scenarioId의 `committed` 또는 `blocked` 기록이 있으면 구형 조기 반환 경로는 시나리오 불일치 검증을 건너뛰었다.

## 수정
- 최초 제출·기존 pending·committed·blocked의 판정을 **단일 `stageForegroundSubmission` readwrite 트랜잭션**에 일원화했다.
- 별도 사용자 인덱스 목록 조회가 실패해도 직접 제출의 IDB 트랜잭션은 정상 작동할 수 있도록 경로를 단순화했다.
- 서버 전송/영수증 로컬 정리 전에 반드시 IDB 최신 행의 사용자·시나리오 바인딩을 확인한다.
- 기존 사용자 인터페이스 및 공개 반환 계약은 변경하지 않았다.

## 테스트
- `submissionQueueCommit.test.ts` 5건 추가: getAll 실패한 최초 온라인 제출, 다른 시나리오 committed 충돌, 다른 시나리오 blocked 충돌, getAll 실패한 영수증 복원, getAll 실패한 blocked 보존.
- 통합 mock Vitest 누적 61건 **작성**, 전체 Vitest 실행은 미완료.
- 실제 Playwright Chromium은 `net::ERR_BLOCKED_BY_ADMINISTRATOR`로 로컬 HTTP 탐색이 제한된다. 따라서 브라우저 검증 PASS로 주장하지 않는다.
- 정책 분리 모듈의 TypeScript 격리 컴파일 및 기존 스모크 테스트는 별도 검증 대상이다.
- `main`, PR #79, 원격 Supabase, Cloudflare, GitHub Actions 변경 없음. Tasklist 코드 환산 75.6%, T5-04 PARTIAL.
