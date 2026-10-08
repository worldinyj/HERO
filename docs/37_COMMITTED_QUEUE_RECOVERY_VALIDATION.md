# HERO — 서버 확정 후 committed 큐 복구

2026-10-08 | branch work/actions-paused-batch-20261008 | T5-03 PARTIAL

## 오류
서버 완료 영수증 확인 후 IndexedDB 삭제 실패 시 pending 기록이 재제출되어 불필요한 중복 요청이 발생할 수 있었다. 또한 게임 캐시 정리에 실패했는데 큐 행을 먼저 삭제하면 기기 정리를 재시도할 단서가 사라졌다.

## 변경
- pending/blocked 외 committed 상태 추가. 서버 성공 영수증을 받은 뒤에만 기존 큐 행을 committed로 변경한다.
- 게임 캐시 정리를 먼저 완료한 후 큐 행을 삭제한다. 실패하면 committed 기록을 보존한다.
- runFlush는 committed 항목을 우선 처리하며 네트워크 없이 로컬 정리만 수행한다. 서버 제출은 pending 항목으로 한정한다.
- IndexedDB 오픈 실패를 조용히 삭제 성공으로 처리하지 않도록 개선했다.
- 단위 테스트 2건, 기존 mock IDB 보강 및 재제출/오프라인/캐시 실패/로그인 전환 시나리오 4건 작성.

## 검증 및 보류
- Node22 격리 상태 정책 테스트 10/10 PASS. 독립 TypeScript strict 검사 PASS (동등 타입 스텁).
- 전체 Vitest, TypeScript 앱 전체, 실제 IndexedDB abort, Playwright, Deno, pgTAP, 원격 DB 미실행. 완료 판정 T5-03 PARTIAL 유지, 진도율 75.6%.
- main, PR #79, GitHub Actions, Supabase, Cloudflare 변경 없음.
