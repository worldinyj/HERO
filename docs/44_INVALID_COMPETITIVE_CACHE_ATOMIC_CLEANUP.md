# HERO — 손상된 경쟁 플레이 캐시의 조건부 삭제

2026-10-08 · `work/actions-paused-batch-20261008` · T5-04 PARTIAL

## 결함 및 영향
- `CompetitiveGamePage`의 기존 cache 복구 조건은 `saved.scenario.version` 및 `saved.game.scenarioId`를 중첩 확인 없이 읽어 IndexedDB 레코드가 손상됐을 때 TypeError가 발생할 수 있었다.
- `loadCompetitiveSession` 후 정상 여부를 판정한 뒤 `clearCompetitiveSession`이 무조건 해당 키를 삭제했다. 두 호출 사이 다른 탭에서 정상 캐시/새 replay를 저장하면 새 기록까지 지워질 수 있었다.

## 수정
- 신규 `competitiveCacheValidation.ts`: `unknown` 형태의 저장 데이터를 검사하고 사용자·시나리오·버전·시나리오 및 게임 상태·서버 세션 필드를 확인한 뒤에만 복구한다.
- `competitivePersistence.ts`: `clearInvalidCompetitiveSession(userId, scenarioId)`은 단일 IndexedDB `readwrite` 트랜잭션에서 최신 레코드를 다시 읽는다. 현재 정상 레코드라면 삭제하지 않으며, 실제 잘못된 레코드인 경우에만 삭제한다.
- `CompetitiveGamePage.tsx`: 조건부 삭제로 바꾸고, 정상 기록 교체가 발견되면 오래된 세션을 표시하거나 시작하지 않고 새로고침 안내를 표시한다.
- 정책 Vitest 5건, IndexedDB mock 통합 3건 추가. 기존 `game()` 테스트 픽스처를 엔진의 시나리오 식별자와 일치시키도록 보완.

## 검증 및 보류
- 순수 캐시 검증 로직의 격리 Node 및 standalone strict TypeScript 검사 수행.
- 전체 Vitest, 브라우저 다중 탭, 실제 IndexedDB 트랜잭션, 모바일 Safari/Samsung Internet, DB 멱등성은 NOT RUN.
- `main`, PR #79, GitHub Actions, Supabase, Cloudflare 변경하지 않음. 기존 코드 진척률 75.6% 유지.
