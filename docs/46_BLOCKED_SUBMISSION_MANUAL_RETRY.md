# HERO — 사용자 의사에 따른 거절 세션 수동 재시도

2026-10-08 | 브랜치: `work/actions-paused-batch-20261008` | T5-04 PARTIAL

## 오류 및 변경 내용
- 기존 `retryBlockedSubmission`은 blocked→pending으로 바꾼 후 백그라운드 flush를 실행하고 void만 반환했다. 플레이 화면에는 적용되지 않았으며 '수동 재시도 필요' 버튼은 비활성화 상태였다.
- 플레이 종료 화면에 **보관된 기록 수동 재시도** 버튼을 연결했다. 현재 사용자가 로그인해 있고 온라인인 경우만 명시적 클릭으로 재시도할 수 있다.
- 재시도는 `listQueuedSubmissions`에서 검증된 로그인 사용자·선택한 시나리오·세션의 저장 원본 `body`만 사용한다. React game state의 행동 로그를 재계산하지 않는다.
- 수동 재시도 API는 SubmissionResult를 반환한다. 동일 세션 잠금으로 전송, 영수증 확인, 로컬 정리까지 직렬화한다. 정상 응답일 때만 시즌 결과 평가를 화면에 표시한다.
- 영구 거절은 계속 blocked 상태로 보존하고, 재시도 가능 오류는 pending으로 관리한다. 오프라인 전환 시 기존 blocked 상태를 유지한다.
- 기존 직접 제출이 보관된 pending 기록을 영구 거절당했다면 UI에 즉시 수동 재시도 요구를 표시한다.

## 회귀 테스트
- `submissionQueueCommit.test.ts`의 6개 시나리오: 원본 로그 기반 재제출 성공, 타인 기록 보호, 다른 시나리오 거부, 오프라인 보존, 503 재시도 허용, 409 재거절 보존.
- 실제 Vitest 전체, 브라우저 E2E, 실제 IndexedDB 및 Supabase DB 테스트는 수행하지 않았다. 코드 정적 검사와 격리 단위 검증에 한정한다.
- `main`, PR #79, GitHub Actions, Supabase 원격 DB 및 Cloudflare 변경 없음. 기존 Tasklist 환산 진척률 75.6%, T5-04 PARTIAL 유지.
