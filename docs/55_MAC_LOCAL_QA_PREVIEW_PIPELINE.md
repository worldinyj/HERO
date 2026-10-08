# HERO — GitHub Actions 대체: Mac 로컬 동기화·QA·스테이징 배포

2026-10-08 · 대상 브랜치 `work/actions-paused-batch-20261008` · 운영 배포 제외

## 1. 원칙
GitHub Actions의 수행 횟수를 사용하지 않고 Mac의 HERO 폴더에서 **GitHub → Git fetch/fast-forward → 로컬 검사/빌드/브라우저 검증 → 로컬 Supabase pgTAP → Cloudflare Pages 미리보기 배포**를 진행한다. 이 스크립트는 `git push`, `supabase db push`, `supabase db reset`, 원격 Edge Function 배포, Cloudflare production 배포를 **실행하지 않는다**.

필수 도구: macOS, Git, Node 22 이상, pnpm (root package.json 지정 버전), Playwright Chromium, Docker Desktop, Supabase CLI, 선택적 Cloudflare Wrangler. 프로젝트는 pnpm lockfile을 Git에서 관리하지 않으므로 최초 `pnpm install --no-frozen-lockfile`이 필요하며 별도 root pnpm-lock.yaml이 생성될 수 있다.

## 2. 최초 1회 GitHub 브랜치 체크아웃
터미널에서 현재 HERO 폴더에 있을 때 다음을 순서대로 실행한다.
```bash
git status --short
git fetch origin --prune
git switch -c work/actions-paused-batch-20261008 --track origin/work/actions-paused-batch-20261008
```
이미 같은 이름의 로컬 브랜치가 있다면 마지막 명령 대신:
```bash
git switch work/actions-paused-batch-20261008
git pull --ff-only origin work/actions-paused-batch-20261008
```
로컬 수정이 표시된다면 먼저 별도 커밋/백업한다. 무조건 초기화 명령은 사용하지 않는다.

## 3. 매번 GitHub 동기화와 Mac QA
```bash
node scripts/hero-local.mjs doctor
node scripts/hero-local.mjs sync
pnpm install --no-frozen-lockfile
pnpm exec playwright install chromium
node scripts/hero-local.mjs qa
```
`qa`가 순차 수행하는 검사: `node --test` 운영 스크립트 시험, lint, typecheck, tasklist 및 DB 정적 계약, Vitest, build, 그리고 실제 Chromium 두 탭 IndexedDB Playwright. 하나라도 실패하면 중지하고 PASS 근거를 저장하지 않는다.

DB를 포함한 완전 QA는 별도 로컬 Docker 기반 Supabase를 실행한 후:
```bash
supabase start
node scripts/hero-local.mjs qa --with-db
```
`--with-db`는 **로컬** `supabase test db --local`을 추가하고, 연결된 원격 데이터베이스에 쓰기 작업을 하지 않는다. 두 커넥션 경합 시험은 추가로 별도 로컬 데이터 초기화 가능 환경에서 수동 실행한다.

QA PASS 기록은 Git 비추적 `.hero-local/qa-pass.json`에 SHA, 테스트 시각, 로컬 DB 여부, 빌드 해시, **환경파일 내용의 해시만** 저장한다. 비밀키 본문은 넣지 않는다.

## 4. Cloudflare Pages 미리보기 배포 — 명시적 승인 필요
먼저 **무시되는 로컬 설정 파일** `apps/web/.env.production.local`을 준비한다 (환경변수: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_KAKAO_JS_KEY`). **서비스 역할 키 / `sb_secret_`를 브라우저 환경변수로 넣으면 안 된다.** 반드시 파일을 QA/빌드 *이전*에 준비해야 한다.

`npm install -g wrangler` 후 Cloudflare 계정 로그인:
```bash
wrangler login
node scripts/hero-local.mjs qa --with-db
node scripts/hero-local.mjs preview --project=hero-dnr --preview-branch=qa-local --confirm-preview
node scripts/hero-local.mjs smoke --url=https://qa-local.hero-dnr.pages.dev
```
`hero-dnr`는 문서에 기록된 Pages 도메인에서 유추한 예시다. Cloudflare Dashboard에서 **실제 프로젝트 이름과 Production branch가 qa-local이 아닌지 반드시 확인**해야 한다.

배포 사전차단: 청결한 정확한 로컬 브랜치, origin 추적 SHA 일치, 24시간 이내 `qa --with-db` PASS, 빌드 파일 해시/환경파일 해시 동일, preflight 통과, 프로젝트/브랜치 이름 검증, 명시적 `--confirm-preview`가 모두 필요하다. Cloudflare는 미리보기 브랜치만 배포한다. 스모크 테스트는 별도 명령으로 돌린다.

Cloudflare Git 통합을 유지하는 경우, **Workers & Pages → 프로젝트 → Build → Branch control**에서 자동 production/preview 배포를 중단하고 직접 Wrangler 배포만 사용하도록 설정할 수 있다. GitHub Actions를 중단해도 Cloudflare 자체 Git 자동 배포는 별개의 설정이다.

## 5. 아직 하지 않은 일
- 사용자 MacBook에서 위 명령 실행, 외부 Cloudflare 업로드, 원격 Supabase DB 스키마 변경, 실제 운영 롤아웃은 이 대화에서 **실행하지 않았다**.
- 기존 릴리스 문서의 법무·실기기·시나리오·파일럿 승인 게이트는 별도로 유지한다. 미리보기 배포 PASS는 production 출시 승인이 아니다.
- `main`, PR #79, GitHub Actions, Supabase 원격 DB, Cloudflare 현재 서비스 배포를 변경하지 않았다.
