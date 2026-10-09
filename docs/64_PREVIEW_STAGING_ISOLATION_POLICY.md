# HERO — 스테이징 DB 구획 격리와 Preview 사전검증 (2026-10-08)

## 결정 근거

- 사용자가 Mac의 `node --test scripts/hero-local.test.mjs` **5/5 PASS**를 확인함 (SHA `02f195e7`).
- Cloudflare Pages: 프로젝트명 `hero`, 기본 도메인 `hero-dnr.pages.dev`, Production branch `main`, 자동 Production Enabled, Preview None 선택 화면.
- Supabase Free 조직에는 활성 프로젝트 두 개가 있음. 새 프로젝트 비용 조회는 **월 $0**이지만, 공식 문서의 Free 프로젝트 2개 상한에 도달한 상태. Supabase DB 개발 브랜치 생성 비용 조회는 **시간당 USD 0.01344**.
- 기존 프로젝트 `alhpooapiokyuxysdzzp`는 마이그레이션 15개이며 로컬은 24개. 기존 원격을 최신 앱의 staging 용도로 재사용하면 서비스 상태를 혼동할 수 있음.
- 조직·과금·프로젝트 생성에는 별도 사용자 승인 전 어떤 요청도 하지 않음.

## 구현

1. `checkPreviewBackendEnv`: `HERO_STAGING_SUPABASE_REF`를 20자리 영소문자·숫자 ref로 명시하고 `VITE_SUPABASE_URL`이 정확히 `https://<ref>.supabase.co`인 경우에만 허용. 기존 두 프로젝트는 ref가 일치해도 허용하지 않음.
2. `HERO_APP_URL`도 `https://qa-local.hero-dnr.pages.dev`와 일치해야 함. 보호하는 ENV 항목의 중복 정의는 차단.
3. `preview-check`는 QA 증거(동일 SHA·빌드해시·환경해시·24시간·DB 검증), Wrangler 존재, 정적 preflight, 스테이징 격리 정책을 **업로드 없이** 확인한다.
4. `preview`도 동일한 검사를 통과한 뒤에만 기존의 명시적 `--confirm-preview`를 요구한다.
5. 별도 배포 또는 환경변수 값, SSH 키·Supabase 비밀키 출력은 없다.

## Mac 재검증

```bash
git pull --ff-only origin work/actions-paused-batch-20261008
node --test scripts/hero-local.test.mjs
node scripts/hero-local.mjs qa --with-db
```

스테이징 전용 Supabase가 준비되기 전에는 `apps/web/.env.production.local`을 운영 프로젝트로 채우지 말 것. 원격 프로젝트를 생성·변경하지 않았고 Cloudflare에 업로드하지 않았다. 새로운 코드 SHA에 대한 실제 Mac 재검증은 아직 실행되지 않음.
