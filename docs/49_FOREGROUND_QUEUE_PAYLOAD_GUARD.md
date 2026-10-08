# HERO — 보관된 행동 로그의 온라인 직접 제출 전 일치성 검사

2026-10-08 | T5-04 PARTIAL | work/actions-paused-batch-20261008

## 결함
기존 제출 큐는 IndexedDB 쓰기 시 행동 로그 불변성을 검증했으나, `submitSessionWithQueue`가 온라인 직접 제출을 수행할 때는 이미 존재하는 pending 기록을 확인한 뒤 **새 화면에서 구성한 `input.body`를 그대로 서버에 전송**했다. 따라서 저장된 오프라인 증거와 다른 의사결정이 서버로 제출될 수 있었다.

## 코드 수정
- `submissionQueueWritePolicy.sameSubmissionBody`를 재사용 가능한 함수로 노출하고, 손상된 IndexedDB actions 항목에서 예외 대신 불일치가 나오도록 보강했다.
- `submitSessionWithQueue`: 기존 pending 행이 있으면 시나리오 ID, 세션 ID, 행동 목록, reflectionAnswered, swissCheeseViewed가 동일한지 **네트워크 호출 이전에 검증**한다.
- 불일치 시 `submission_queue_payload_conflict`로 거절하고 서버 호출이나 기존 pending 행 변경을 하지 않는다.
- 일치 시에는 새로운 React 상태가 아니라 **기존 저장된 body**를 서버에 전달한다.
- 플레이 화면에는 기존 로컬 기록 보호와 새로고침 안내를 한글로 표시한다.

## 회귀 범위
- 순수 저장 본문 비교 정책 Vitest 5건과 온라인 직접 제출 통합 모의 Vitest 4건을 추가했다.
- 실제 전체 Vitest/브라우저 2탭/서버 DB 멱등성은 미실행. 정적 타입 및 격리 단위 시험을 별도로 수행한다.
- `main`, PR #79, 원격 Supabase, Cloudflare, GitHub Actions는 변경하지 않는다. 코드 환산 진도 75.6% 유지.

## 손상된 오프라인 행동 로그의 형식 검사

저장소 기록의 배열 항목이 문자열·숫자·알 수 없는 행동 종류이거나 `choice/info/card`의 필수 ID가 누락된 경우, 단순 속성 비교로 두 잘못된 기록을 일치한다고 판단하지 않도록 보완했다. `continue`에는 불필요한 ID를 허용하지 않으며, 정상 `continue/choice/info/card`는 여전히 통과한다. 관련 Vitest 사례 4건을 추가했다. 전체 Vitest와 실제 브라우저 실행 검증은 미완료다.
