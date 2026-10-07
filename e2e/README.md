# HERO E2E 테스트

## 목적

T7-01의 핵심 사용자 흐름을 실제 브라우저와 로컬 Supabase에서 검증한다.

```
초대 링크
→ 카카오 로그인 버튼
→ 초대 수락/닉네임/동의
→ 캠페인
→ 경쟁 시나리오 브리핑
→ 플레이
→ 결과/회고/Swiss Cheese/HP 서버 검증
→ 리더보드
```

Playwright는 두 모바일 뷰포트에서 각각 독립된 테스트 사용자와 1회용 초대를 사용한다.

- 390 × 844
- 360 × 800

## 인증 모킹 범위

실제 Kakao 외부 OAuth 화면만 자동화 대상에서 제외한다.

웹 앱은 `VITE_E2E_MODE=true`일 때만 카카오 버튼 클릭을 로컬 Supabase의 테스트 사용자 password sign-in으로 대체한다. 일반 개발/프로덕션 빌드에서는 이 분기가 비활성화되고 기존 Kakao OAuth가 그대로 실행된다.

테스트 비밀번호는 저장소에 저장하지 않는다. GitHub Actions 실행 중 `openssl rand`로 생성해 환경변수로만 전달한다.

## 실제로 검증하는 것

다음 경로는 mock API가 아니라 로컬 Supabase DB와 실제 Edge Function을 사용한다.

- `peek-invite`
- `nickname-action`
- `accept-invite`
- 현재 시즌/시나리오 조회
- `start-session`
- `submit-session`
- 서버 엔진 재실행 및 점수 확정
- 리더보드 공개 뷰
- RLS가 적용된 브라우저 데이터 접근

## 로컬 실행

Docker와 Supabase CLI가 실행 가능한 환경이 필요하다.

1. `supabase start`
2. 로컬 Supabase URL/anon/service role 값을 환경변수로 설정
3. 테스트용 임시 비밀번호 3개를 환경변수로 설정
4. `apps/web/.env.e2e.local`에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_E2E_MODE=true` 설정
5. `supabase functions serve`
6. `pnpm e2e:setup`
7. `pnpm exec playwright install chromium`
8. `pnpm e2e`

GitHub Actions에서는 위 절차를 `.github/workflows/e2e.yml`이 자동 수행한다.

## 실패 산출물

실패 시 다음 자료를 GitHub Actions artifact로 보존한다.

- Playwright HTML report
- trace/screenshot/video
- 로컬 Edge Function 로그
- 로컬 Supabase 상태 JSON

실제 프로덕션 Kakao OAuth, 카카오톡 인앱 브라우저, iOS Safari, Samsung Internet 실기기 검증은 T7-02에서 별도로 수행한다.


## Accessibility gate

The mobile E2E flow also runs automated accessibility checks with
`@axe-core/playwright` on invitation, onboarding, campaign, chapter briefing,
decision, HP review, and leaderboard states.

The gate covers WCAG 2.0/2.1/2.2 A and AA axe rules. It also verifies:

- the skip link is keyboard reachable and has a 44px minimum target height;
- SPA route changes move focus to the main content region;
- the campaign has no horizontal overflow when the root text size is doubled;
- audio is not required to understand the tested flow.

Automated axe checks do not replace real-device screen-reader, browser zoom,
or human usability review. T7-02/T7-03 still require final manual checks on the
target mobile browsers.
