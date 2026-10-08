# HERO — 제출 영수증 복구와 오프라인 큐 정합성 점검

2026-10-08 | 브랜치: `work/actions-paused-batch-20261008` | T5-03 **PARTIAL**

## 실제 코드 검토에서 확인한 문제
1. `submitSessionWithQueue`의 같은 async 콜백 범위에서 `const existing`이 중복 선언되어 TypeScript TS2451 빌드 차단 위험이 있었다.
2. 완료 응답을 저장하지 않은 구형 `committed` 행을 먼저 삭제한 후에야 영수증 부재를 검사했다. 이때 사용자에게 완료 결과를 복원할 단서까지 잃을 수 있다.
3. `startSubmissionQueueProcessor`의 시작/화면 가시성 콜백은 offline 상태에서 모두 중지되어, 서버 확정 `committed` 행에 필요한 **로컬 정리만** 하는 처리를 실행하지 못했다.
4. 완료 영수증 마커 쓰기 실패가 cleanupPending 반환에 반영되지 않아 정리 지연 안내가 빠질 수 있었다.

## 적용한 수정
- 거절된 이전 대기 기록 변수명을 `rejectedQueuedRow`로 변경하여 동일 범위 중복 선언 제거.
- 영수증을 검증한 뒤에만 구형 `committed` 레코드의 정리를 진행. 없거나 잘못된 경우 해당 기록 보존, 서버 중복 호출 금지.
- offline에서도 processor가 `runFlush`를 호출하여 committed 로컬 정리를 허용. pending 항목의 네트워크 전송은 계속 온라인에서만 실행.
- 마커 쓰기 실패도 `cleanupPending` 표시. 영수증이 없는 오래된 기록은 관리자 확인 필요 안내를 표시.
- 기존 Supabase 및 IndexedDB mock 회귀 테스트에 3개 사례 추가.

## 검증 상태 및 제약
- GitHub 변경 코드 앵커 및 동일 범위 중복 선언 제거 여부 검사. 
- 이 세션의 전체 Vitest, monorepo TypeScript, 로컬 실제 IndexedDB, Deno, Postgres pgTAP, Playwright/실기기 테스트 **미실행**. 실행 전까지 완료로 승격 금지.
- 마커 쓰기와 삭제가 **둘 다 실패**할 경우 이전 pending 행이 남을 수 있다. 서버의 `complete_play_session_atomic` 멱등성 실검증이 반드시 필요하다.
- GitHub Actions 중지 유지; `main`, PR #79, Supabase staging/prod, Cloudflare 미변경. 진도 75.6%는 기존 근거로 유지.
