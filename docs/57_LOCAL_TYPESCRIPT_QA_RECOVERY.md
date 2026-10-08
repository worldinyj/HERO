# HERO — 로컬 TypeScript typecheck 오류 9건 수정

2026-10-08 | 브랜치 `work/actions-paused-batch-20261008`

Mac에서 `pnpm lint`와 로컬 운영 스크립트 3개 테스트가 통과했으나 `pnpm typecheck`에서 TS2345 1건, TS2532 7건, TS2322 1건으로 중단됐다.

- `ProfilePage.tsx`: RPC로 검증한 닉네임을 `confirmedNickname` 상수로 좁혀, React state updater 콜백 안에서도 `string` 타입을 보장한다. 검증 정책·화면 동작은 변경하지 않는다.
- `submissionForegroundStore.test.ts`: 시나리오 픽스처의 두 번째 행동에 비어 있지 않다는 non-null 표기를 추가한다.
- `submissionQueueCommit.test.ts`: IndexedDB 모의 큐의 배열 첫 요소를 접근할 때 optional chaining을 사용한다. 실제 값이 없으면 `expect(undefined)`가 실패하므로 검증을 생략하지 않는다.
- `submissionSerial.ts`: Web Locks API가 callback의 `Promise<T>`를 포장한 `Promise<Promise<T>>`로 추론하는 TypeScript 반환 문제를 `return await`로 해결하고 Promise 반환값을 실제 완료 결과로 평탄화한다. 잠금 범위와 예외 전달은 유지한다.

검증은 Mac의 `pnpm --dir apps/web typecheck`와 전체 `node scripts/hero-local.mjs qa`를 재실행해 확인해야 한다. 본 커밋의 **전체 앱 typecheck/Vitest/브라우저 테스트 PASS는 아직 확인하지 않았다**. `main`, PR #79, Actions, 원격 DB/배포는 변경하지 않는다.
