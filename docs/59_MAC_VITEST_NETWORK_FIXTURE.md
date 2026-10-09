# HERO Mac Vitest — 온라인/오프라인 테스트 픽스처 복구

2026-10-08 | `work/actions-paused-batch-20261008`

## 증상 (실제 Mac 실행 로그)
- 로컬 QA 자체 테스트 3/3, lint, TypeScript, Tasklist 정적 정합성, DB 정적 계약 검사 PASS.
- Engine Vitest 19/19 PASS.
- Web Vitest 300개 중 273 PASS, 27 FAIL. 실패가 **모두 `submissionQueueCommit.test.ts` (61개 테스트 중 27개)** 에 집중되었다.
- 여러 실패에서 실제 반환값 `queued/offline` 또는 `queued/offline_manual_retry_unavailable`, 서버 전송 횟수 0이 관찰되었다.

## 원인
`submissionQueue.online()`은 `typeof navigator === "undefined" || navigator.onLine`을 사용한다. Node.js 26의 Vitest 실행 환경에서 `navigator`가 존재하지만 `onLine`이 온라인을 표시하지 않아, 온라인을 가정한 테스트가 일괄 오프라인 처리되었다.
이 오류는 제품의 오프라인 보관 기능 결함으로 단정할 수 없다. 테스트가 네트워크 가용성을 명시하지 않은 실행 환경 종속 문제이다.

## 변경
1. 큐 통합 테스트 `beforeEach`에서 `vi.stubGlobal("navigator", { onLine: true })`로 기본 온라인 상태를 명시한다.
2. 실제 오프라인 검증 13개 테스트 내역은 기존 `vi.stubGlobal(...onLine:false)`를 유지한다.
3. `afterEach`에서 `vi.unstubAllGlobals()`를 실행해 Node 원래 전역값을 복원한다.
4. 최근 스테이징 구현은 최초 입력 body를 `structuredClone`하여 저장·전송하므로 `toBe`(객체 참조 동일성)를 `toEqual`(내용 동일성)로 수정하고, 최초 저장에서는 오히려 `not.toBe`로 객체 분리를 확인한다.

## 재검증 (Mac)
```bash
git pull --ff-only origin work/actions-paused-batch-20261008
pnpm --dir apps/web exec vitest run src/lib/submissionQueueCommit.test.ts
node scripts/hero-local.mjs qa
```

**중요:** 위 27건에 대한 재실행 결과는 아직 제공되지 않았다. Mac에서 실패하는 검사가 새로 발견되면 결과를 다시 확인한다. 이 변경은 테스트 픽스처의 격리 수정이며, 실제 제품의 `online()` 동작을 우회하거나 보안 정책을 수정하지 않는다.
GitHub Actions / main / PR #79 / 원격 Supabase / Cloudflare 배포는 미변경.
