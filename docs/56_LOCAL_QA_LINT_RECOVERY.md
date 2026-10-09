# HERO — macOS 로컬 QA lint 5건 정비

2026-10-08 · 브랜치 `work/actions-paused-batch-20261008`

## MacBook 로컬 lint 진단 및 수정

MacBook의 `node scripts/hero-local.mjs qa`에서 자체 운영 스크립트 단위 시험 3건이 통과했고, 첫 `pnpm lint` 단계에서 **총 5건**의 ESLint 오류로 중단됐다.

- `AdminOrgPage.tsx:169`: 저장소에 등록되지 않은 `react-hooks/exhaustive-deps` 규칙을 지칭하는 비활성화 주석 제거. 원래 mount-scoped `useEffect`와 코드 기능은 변경하지 않았다.
- `competitivePersistenceProgress.test.ts:16`: 테스트용 모의 IndexedDB `transaction`의 미사용 인자 `_name`, `_mode` 제거. 함수 구현 및 호출 인터페이스는 JavaScript 가변 인자 특성상 동일하게 동작한다.
- `submissionQueueCommit.test.ts:76,126`: 모의 IndexedDB `transaction`의 미사용 `_mode`와 `index`의 미사용 `_name` 제거. 테스트 상태·동작·주장은 변경하지 않았다.

## 후속 실행

```bash
git pull --ff-only origin work/actions-paused-batch-20261008
pnpm lint
node scripts/hero-local.mjs qa
```

위 lint 및 전체 QA는 **Mac에서 아직 재실행 전**이다. 결과를 받은 뒤 타입 검사/Vitest/빌드/Chromium 실패도 순차 수정한다. GitHub Actions, main, PR #79, 원격 Supabase, Cloudflare 프로덕션 배포는 변경하지 않는다.
