# HERO 인증 복귀 주소·초대 재발급 보안 점검

> 2026-10-08 · branch `work/actions-paused-batch-20261008` · **Actions paused**

## 1. 카카오 로그인 복귀 주소 — 수정 반영

`/login?next=`와 `signInWithKakao(returnPath)`는 사용자가 제공할 수 있는 경로를 입력받는다. 이전의 `startsWith("/") && !startsWith("//")` 검사로는 `/\\evil.example`을 차단하지 못했다. 브라우저 URL 파서는 이를 외부 origin으로 해석할 수 있다.

- `apps/web/src/lib/safeReturnPath.ts` : 백슬래시, protocol-relative, 제어문자, 인코딩된 위험한 구분자를 거부하며 WHATWG URL로 같은 origin인지 재확인
- `LoginPage.tsx`와 `lib/supabase.ts`가 공통 검사 함수 사용
- `safeReturnPath.test.ts`에 정상 5건 및 경계/공격 경로 16건을 추가
- **로컬 격리 검사:** Node 22로 해당 함수의 21개 사례 통과, TypeScript standalone check 통과. 전체 앱 통합 Vitest/TS 빌드/실제 Kakao 인증 검증은 **NOT RUN**

## 2. Admin 초대 및 재발급 — 부분 수정

- 발급 직후의 일회용 URL은 관리자 화면에서 명시적으로 정리하기 전까지 보존
- 응답 단절이나 서버 5xx는 발급 성공 여부 불명으로 간주하여 자동 재발급/중복요청 차단
- 다른 초대의 취소가 현재 화면에서 표시된 URL을 제거하지 않도록 수정
- `manager-user-action`의 `SITE_URL` 유효성 검사는 취소·생성 전에 수행
- 사용자 수동 확인표: `docs/14_KAKAO_LIVE_INVITE_VALIDATION.md` ADM-01~05, AUTH-08~11

## 3. 남아 있는 설계 위험 및 검증 요구

**재발급의 DB 원자성은 해결되지 않았다.**

현재 `manager-user-action/index.ts`의 `reissueInvite`는 (1) 기존 초대 `canceled_at` 갱신, (2) 새 초대 INSERT를 별도 Supabase 요청으로 수행한다. INSERT 실패나 중간 통신장애가 발생하면 기존 링크는 취소됐지만 새 링크는 없는 상태가 될 수 있다. 이번 변경은 UI 반복 요청과 잘못된 `SITE_URL`로 인한 원인만 완화한다.

출시 전에 트랜잭션을 사용하는 원자적 DB RPC 및 실패주입/동시성 회귀 테스트를 별도 설계·검증해야 한다. 이를 끝내지 않고 릴리스 준비 PASS를 기록하지 않는다.

## 4. 일괄 CI 재개 시

- `pnpm --dir apps/web test`로 리다이렉트 21개 사례 포함 전체 단위 테스트
- `pnpm --dir apps/web typecheck`, `pnpm --dir apps/web build`
- `deno check --config supabase/functions/deno.json supabase/functions/manager-user-action/index.ts`
- `deno test --config supabase/functions/deno.json supabase/functions/_shared/inviteUrl.test.ts`
- Kakao 실계정 로그인 / 새 사용자 차단 / 관리자·담당자 초대 성공·실패 시험
- PR/main merge, migration016 적용, Supabase 실데이터 수정, 앱 배포는 승인된 통합검증 게이트 후에만 진행
