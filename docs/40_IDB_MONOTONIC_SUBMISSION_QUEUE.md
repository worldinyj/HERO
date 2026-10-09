# HERO — IndexedDB 트랜잭션 내 오프라인 큐 상태 보호

> 2026-10-08 · work/actions-paused-batch-20261008 · T5-04 PARTIAL

## 배경
동일 출처 Web Locks를 지원하지 않는 브라우저에서는 탭 간 세션 단위 잠금을 보장할 수 없다. 따라서 오래된 pending 상태의 탭이 IndexedDB의 새 committed 기록을 덮어쓰지 못하게 저장소 자체에서 검증해야 한다.

## 코드 변경
- `submissionQueueWritePolicy.ts`: 완료 영수증 진위 형식 확인, 세션 소유자 ID 보호, committed 상태 비가역화, 구형 receipt-less committed 행의 검증된 영수증 보강만 허용.
- `submissionQueue.ts`: `writeQueueRecord`를 단일 IndexedDB readwrite 트랜잭션의 `get` → 동기 `onsuccess` 결정 → 조건부 `put`으로 변경. 무효한 영수증과 다른 사용자 ID는 transaction.abort, 기존 committed 상태로의 오래된 업데이트는 무해한 no-op.
- `submissionQueueCommit.test.ts`: IDB mock의 queue.get 로직 수정과 경쟁 상태 스냅샷/사용자 충돌 시험 2건 추가.
- `submissionQueueWritePolicy.test.ts`: 독립 상태 전환 단위 테스트 7건 추가.

## 검증 범위
- 실제 새 정책과 동등한 TS 소스의 격리 컴파일(글로벌 tsc, strict) PASS, Node.js 22 실행 11/11 PASS.
- 전체 Vitest 실행을 시도했으나 npm registry DNS 접근 불가, 사설 저장소의 로컬 직접 복제도 불가. 따라서 통합 Vitest, 진짜 IndexedDB 동시 트랜잭션, 모바일 2탭, Edge/DB 멱등성 검증은 NOT RUN.
- IDBTransaction 성공 이벤트 콜백에서 트랜잭션이 활성 상태인 점을 활용한다: https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction
- 브라우저/OS 강제 종료까지 물리적 디스크 영속성 또는 서로 다른 기기 사이 잠금은 보장하지 않는다. server complete_play_session_atomic의 멱등성 검증이 필수.
- GitHub Actions, main, PR #79, 원격 Supabase 및 Cloudflare 배포는 건드리지 않는다. 기존 진도 75.6%, T5-04 PARTIAL.
