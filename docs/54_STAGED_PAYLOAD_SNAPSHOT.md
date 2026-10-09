# HERO — 최초 스테이징의 저장본·전송본 불변성

2026-10-08 | T5-04 PARTIAL | work/actions-paused-batch-20261008

## 데이터 공유 참조 문제
IndexedDB `put(newRecord)`는 객체를 내부적으로 복제해 저장하지만, 기존 함수는 `result.record = newRecord`로 호출자와 동일한 객체를 반환했다. 스테이징 트랜잭션 완료 후 인증을 다시 확인하는 `await` 구간에서 외부 참조가 변경되면 서버 전송 내용이 보관한 행동 기록과 달라질 가능성이 있었다.

## 해결
- `submissionForegroundStore.stageForegroundSubmission`: `structuredClone(newRecord)`로 별도 요청 스냅샷을 생성하고, **동일 스냅샷을 `put`과 반환값에 사용**한다. 기존 pending 재사용은 `IDB.get`이 반환한 구조화 복사본을 사용한다.
- 실제 브라우저 IndexedDB E2E에서 스테이징 완료 직후 원본 `request.body.actions`를 변형하는 시나리오 추가. 반환된 `staged.record.body`와 IndexedDB 저장본이 모두 최초 행동을 유지하는지 확인한다.
- Playwright E2E 누적 7건 **작성**, 실제 Chromium/전체 Vitest 시험은 미실행이다. 동일 원본 보존 정책의 격리 실행 검증을 별도로 수행한다.
- `main`, PR #79, Actions, 원격 Supabase, Cloudflare 미변경. 환산 진척 75.6%, T5-04 PARTIAL.

## GitHub 소스와 동일한 로컬 검증 결과 (2026-10-08)

실제 GitHub Blob SHA `d60cd6480e6a3029cb3b749c26f8909fe05e93f6`인 `submissionForegroundStore.ts`와 SHA `a17d1f64da035eec03cd901375b769a3d4f3fd87`인 `submissionForegroundStagePolicy.ts`를 로컬에 일치하는 상태로 준비한 후 TypeScript strict 컴파일과 메모리 IndexedDB 트랜잭션 모의 실행을 완료했다. **12/12 PASS** (최초 pending, 반환 참조 분리, 원본 DB 복제, 동일 요청 재사용, 다른 행동·소유자·시나리오 거절, put 실패 등).

저장소에 독립적인 `submissionForegroundStore.test.ts` Vitest 6건을 추가했다. 이 파일의 Vitest 실행은 아직 NOT RUN이며 위 12건은 별도의 Node 격리 시험이다. 브라우저 Playwright는 로컬 환경의 `ERR_BLOCKED_BY_ADMINISTRATOR` 때문에 실제 실행이 제한됐다.
