# HERO — 지연된 서버 start-session 응답의 리플레이 보호

2026-10-08 | work/actions-paused-batch-20261008 | T5-02/T5-09 PARTIAL

기존 saveCompetitiveSession은 임의 put으로 다른 탭의 최신 플레이 및 같은 sessionId의 행동 로그를 덮을 수 있었다. 또한 초기 네트워크 useEffect가 비활성화된 뒤에도 put이 호출될 수 있었다.

- competitiveStartPolicy.ts: 같은 ID는 갱신하지 않으며, 신규/리플레이 ID는 서버 startedAt이 기존 기록보다 엄격하게 늦은 경우만 대체. 식별자 불일치·부정확한 시각·동일 시각은 보존.
- competitivePersistence.saveCompetitiveSession(): IndexedDB readwrite 트랜잭션 안에서 get→검증→put, 반환 boolean으로 승인 여부 전달.
- CompetitiveGamePage: 초기 load effect active 가드 및 재생 저장 충돌 감지. 이전 서버 응답으로 화면 상태를 갱신하지 않고 사용자에게 최신 세션 새로고침을 안내.
- 정책 Vitest 6건, mock IndexedDB 통합 Vitest 4건 추가.

실제 브라우저 2탭, Vitest 전체, 실기기, Edge/DB 검증은 미실행. 메인/PR #79/Actions/원격 Supabase/Cloudflare 미변경. 코드 진도 75.6%, T5-02/T5-09 부분 상태 유지.

## 정책 코드 격리 검증 (2026-10-08)

GitHub에 저장된 `competitiveStartPolicy.ts` 소스를 동일한 내용으로 복사하여 Node.js v22.16.0과 TypeScript v5.8.3 환경에서 검사하였다.

- `tsc --noEmit --strict --skipLibCheck --target ES2022 --lib ES2022,DOM`: **PASS**
- `node --experimental-strip-types check.mjs`: **13/13 PASS**
- 검증 사례: 최초 undefined/null, 더 최신 세션 수락, 동일 ID 보존, 신규 replay 보존, 타임스탬프 동일, 무효 시각, 다른 사용자/키/시나리오, 잘못된 형식의 로컬 캐시, 배열/서버 누락 등.
- 비교 기준: 브랜치 HEAD `6a422564d34b4c393bfff327765a485ec019a075`.
- **검증 범위 한정:** 이 검증은 정책 함수만 실행한 것이며 앱 전체 TypeScript 빌드, Vitest 6+11건, 실제 IndexedDB 원자 트랜잭션, 모바일 실기기 및 실제 Supabase 완료 검증은 여전히 **NOT RUN**이다.
