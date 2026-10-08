# HERO — 지연된 서버 start-session 응답의 리플레이 보호

2026-10-08 | work/actions-paused-batch-20261008 | T5-02/T5-09 PARTIAL

기존 saveCompetitiveSession은 임의 put으로 다른 탭의 최신 플레이 및 같은 sessionId의 행동 로그를 덮을 수 있었다. 또한 초기 네트워크 useEffect가 비활성화된 뒤에도 put이 호출될 수 있었다.

- competitiveStartPolicy.ts: 같은 ID는 갱신하지 않으며, 신규/리플레이 ID는 서버 startedAt이 기존 기록보다 엄격하게 늦은 경우만 대체. 식별자 불일치·부정확한 시각·동일 시각은 보존.
- competitivePersistence.saveCompetitiveSession(): IndexedDB readwrite 트랜잭션 안에서 get→검증→put, 반환 boolean으로 승인 여부 전달.
- CompetitiveGamePage: 초기 load effect active 가드 및 재생 저장 충돌 감지. 이전 서버 응답으로 화면 상태를 갱신하지 않고 사용자에게 최신 세션 새로고침을 안내.
- 정책 Vitest 6건, mock IndexedDB 통합 Vitest 4건 추가.

실제 브라우저 2탭, Vitest 전체, 실기기, Edge/DB 검증은 미실행. 메인/PR #79/Actions/원격 Supabase/Cloudflare 미변경. 코드 진도 75.6%, T5-02/T5-09 부분 상태 유지.
