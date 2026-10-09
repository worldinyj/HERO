# HERO — 늦게 도착한 플레이 저장의 완료 세션 재생성 방지

> 2026-10-08 | branch work/actions-paused-batch-20261008 | T5-04 / T5-09 PARTIAL

## 발견한 경합
- CompetitiveGamePage.dispatch는 게임 상태를 메모리에 갱신하고 `persist(nextGame)`을 await하지 않았다. 기존 persist는 `saveCompetitiveSession`의 무조건 IndexedDB put을 실행했으므로, 느린 저장이 서버 제출 성공 후 로컬 캐시를 다시 생성하거나 다른 탭에서 새로 만든 replay를 덮어쓸 수 있었다.
- 빠르게 연속 선택할 때 진행 로그가 더 긴 최신 기록을 늦게 끝난 짧은 로그 저장이 되돌리는 상황도 가능했다.

## 조치
- 신규 `competitiveProgressPolicy.ts`: 캐시의 사용자/시나리오/서버 sessionId가 현재 업데이트와 동일하고, 들어오는 게임 로그 길이가 **엄격하게 더 긴 경우**에만 수정한다. 기존 기록 부재 시 재생성하지 않고, 다른 세션 replay 및 최신 로그는 보존한다.
- `competitivePersistence.ts`: `updateCompetitiveSessionProgress`는 기존 캐시의 `get`과 조건부 `put`을 단일 IndexedDB `readwrite` 트랜잭션에서 수행한다.
- `CompetitiveGamePage.tsx`: 사용자의 개별 행동 이후 비동기 저장만 새 조건부 update를 사용한다. 첫 세션 생성과 명시적 replay 생성은 기존 `saveCompetitiveSession`을 유지한다.
- `competitiveProgressPolicy.test.ts`: 같은 세션 신규 진행/완료 후 삭제/다른 리플레이/사용자와 시나리오 불일치/역행 로그/동일 로그/오류 데이터 총 7개 테스트.

## 검증 제한
- 정적 연결 검사 및 정책 격리 Node/TypeScript strict 검사. 전체 Vitest, 실제 IndexedDB의 탭 간 경합, Playwright·실기기 시험은 NOT RUN.
- 신규 replay 생성 직전 경쟁 탭의 오래된 시작 응답에 대한 순서 통제는 별도 후속 평가가 필요하며, 서버 완료 RPC 멱등성 실검증 역시 남아 있다.
- GitHub Actions 중지, main/PR #79/Supabase/Cloudflare 변경 없음. 75.6% 진도율 유지, T5-04/09 부분 상태.

## 추가 회귀 테스트
- `competitivePersistenceProgress.test.ts`: IndexedDB 트랜잭션 mock을 사용한 최초 저장·동일 세션 발전·완료 후 캐시 제거·신규 replay 보존·로그 역행 거부·동일 길이 거부·쓰기 실패 전파 총 7개 사례를 추가했다.
- 정책 단위 테스트와 트랜잭션 mock 테스트는 모두 GitHub 소스에 작성했지만, 이 단계에서 **Vitest 전체 실행은 하지 않았다**. 브라우저 간 실제 IDB transaction scheduling 검증도 미완료다.
