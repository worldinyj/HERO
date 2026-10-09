# HERO — 오프라인 제출과 온라인 최초 제출의 원자적 상태 판정 통합

2026-10-08 | T5-04 PARTIAL | work/actions-paused-batch-20261008

## 결함
기존 오프라인 경로는 `getAll(userId)`로 목록을 조회한 뒤 `enqueueForUser`를 호출했다. 목록 조회 시점과 실제 readwrite 트랜잭션 사이 다른 탭에서 기록을 committed 또는 blocked로 바꾸면 쓰기 정책이 데이터를 보존하더라도 호출자에게는 `queued/offline`이라고 잘못 알릴 수 있었다. 다른 선택으로 pending이 이미 저장된 경우도 UI 대신 예외 처리에 빠졌다.

## 수정
- 오프라인·온라인 공통으로 `stageForegroundSubmission(userId,input)`이 단일 IndexedDB readwrite 트랜잭션에서 최신 기록을 검사하게 변경했다.
- committed: 검증된 서버 영수증이면 네트워크 없이 `submitted` 및 로컬 정리, 미검증 legacy tombstone은 `confirmed_cleanup_pending` 반환.
- blocked: 자동 pending 전환을 막고 `submission_blocked_requires_manual_retry` 반환.
- payload_conflict: 원본을 보존하고 오류 상태를 반환. 최초 pending 또는 동일한 pending은 `offline`으로만 대기.
- 중복 역할이 된 `enqueueForUser`를 제거해 스테이징 정책이 두 경로에서 어긋나지 않게 했다.

## 테스트 및 제한
- 기존 모의 IndexedDB 통합 테스트의 오래된 3개 기대값을 실제 반환 정책에 맞춰 보정했다.
- 목록에서 누락된 blocked, legacy committed, 다른 payload를 오프라인에서 재확인하는 Vitest 3건 추가. 새 통합 테스트 파일 누적 56건.
- 실제 Vitest·브라우저 Playwright 두 탭은 현재 환경에서 미실행이며 로컬 Chromium은 관리자 정책으로 파일·loopback 접근이 차단됐다.
- Actions 0회 유지, main/PR #79/원격 Supabase/Cloudflare 미변경. Tasklist 환산 75.6%, T5-04 PARTIAL.
