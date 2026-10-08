# HERO — 실제 브라우저 IndexedDB 동시 저장 검증

2026-10-08 | T5-04 PARTIAL | work/actions-paused-batch-20261008

## 변경 목적

기존 \`submissionQueueCommit.test.ts\`는 IndexedDB를 메모리 mock으로 대체하여 테스트했다. 실제 브라우저에서 서로 다른 탭의 \`readwrite\` 트랜잭션이 직렬화되고, 동시에 생성된 pending 기록이 덮어써지지 않는지를 별도로 확인해야 한다.

## 구현

- \`submissionForegroundStore.ts\`를 \`submissionQueue.ts\`에서 분리. **내부 스테이징 함수 본문을 변경하지 않고** 독립 모듈로 추출했으며, 기존 호출부는 해당 함수를 그대로 사용한다.
- \`e2e/atomic-indexeddb-submission.spec.ts\`에 Playwright 5개 테스트 추가. Vite가 제공하는 **실제 스테이징 모듈을 브라우저에서 dynamic import**하여 실행한다.
- 동일 출처 탭 2개를 동시에 열고 동일 세션 ID에 대해 서로 다른 행동 / 동일 행동 / 다른 사용자 / 이미 완료된 기록 / blocked 기록을 각각 검증한다.
- 브라우저의 \`indexedDB.open("hero-offline", 3)\`과 실제 \`submission-queue\` objectStore로 지속성 및 충돌 후 결과를 검사한다.
- 이 테스트는 로그인이 필요 없으며 실제 Edge Function이나 Supabase DB에 접근하지 않는다. Playwright 웹 서버는 기존 \`playwright.config.ts\`의 로컬 Vite 포트 4173을 사용한다.

## 실행 안내

로컬 개발 환경에서 의존성을 설치한 뒤 다음을 실행한다.

\`\`\`bash
pnpm exec playwright test e2e/atomic-indexeddb-submission.spec.ts --project=mobile-390x844
\`\`\`

## 검증 범위 및 미완료

- 실제 Playwright + 브라우저에서 검증하는 경로의 코드를 **작성했다**. 이 대화 실행 환경에서는 pnpm/Vitest 의존성 미설치로 아직 Playwright 결과는 NOT RUN.
- 새 E2E는 트랜잭션 간 충돌만 검사하며 기기 전원 종료·브라우저 crash durability, Safari WebKit, 서버 점수 확정 동시 요청은 별도 검증 대상이다.
- 서버 및 배포 환경, main, PR #79, GitHub Actions는 변경하지 않았다. 전체 Tasklist 코드 환산 진도율 75.6%, T5-04 PARTIAL 유지.
