# HERO — 로컬 전체 모바일 E2E 사전점검

2026-10-08; GitHub Actions 없이 Mac에서 실행

## 증거

8654f5a9: qa --deep --with-deno --with-db PASS. 전체 모바일 E2E는 아직 NOT_RUN.

## 목적

- 기존 로컬 Supabase 프로젝트 hero, API 포트 55321, DB 포트 55322 확인
- supabase status --output json의 키는 로그에 출력하지 않고 검사
- 브라우저 전용 apps/web/.env.e2e.local에 로컬 API와 공개 anon 키만 유지
- VITE_E2E_MODE=true 및 service-role 비밀키 오삽입 차단
- 기본 명령은 읽기 전용이며, --prepare-web-env만 파일을 신규 생성
- 기존 파일을 덮어쓰지 않고, 데이터 seed/reset/삭제/배포를 하지 않음

## Mac 명령

1. git pull --ff-only origin work/actions-paused-batch-20261008
2. node --test scripts/hero-local.test.mjs
3. node scripts/check-local-e2e-preflight.mjs

3번에서 web_env_missing이 뜨고 apps/web/.env.e2e.local 파일이 없다면 다음 명령:

node scripts/check-local-e2e-preflight.mjs --prepare-web-env
node scripts/check-local-e2e-preflight.mjs

Supabase가 시작되지 않은 경우 hero_local_supabase_unavailable으로 중지.
실행 중인 로컬 HERO Supabase를 재설정하지 말 것. supabase db reset 명령은 금지.

사전점검 PASS는 전체 모바일 E2E의 성공을 의미하지 않는다.
이후 Edge Functions serve, fixture 생성 명시적 승인과 충돌검사, 360px/390px Playwright를 별도 수행한다.
