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

`supabase/.temp/`는 Supabase CLI가 만드는 로컬 임시 상태 파일이다. `.gitignore`에서 제외하도록 설정했으므로 `git pull --ff-only` 후 `git status --short`에 표시되지 않아야 한다. 로컬 Supabase 연결 상태가 있을 수 있으므로 해당 폴더를 무단 삭제하거나 커밋하지 않는다.

## 3. 매번 GitHub 동기화와 Mac QA
```bash
node scripts/hero-local.mjs doctor
node scripts/hero-local.mjs sync
pnpm install --no-frozen-lockfile
pnpm exec playwright install chromium
node scripts/hero-local.mjs qa
```
`qa`가 순차 수행하는 검사: `node --test` 운영 스크립트 시험, lint, typecheck, tasklist 및 DB 정적 계약, Vitest, build, 그리고 실제 Chromium 두 탭 IndexedDB Playwright. 하나라도 실패하면 중지하고 PASS 근거를 저장하지 않는다.

### Johnny Fiction과 macOS에서 Supabase 동시 실행

Johnny Fiction이 `54321` API · `54322` DB · `54324` 메일 테스트 포트를 사용하면 HERO 기본 `supabase start`는 bind 오류로 중단된다. **Johnny Fiction 컨테이너를 중지·삭제하지 않는다.** 이 브랜치의 `supabase/config.toml`은 HERO 전용 대역으로 고정했다.

| 구성요소 | HERO 로컬 포트 |
| --- | ---: |
| DB shadow | 55320 |
| API | 55321 |
| PostgreSQL | 55322 |
| Studio | 55323 |
| Inbucket | 55324 |
| SMTP / POP3 (설정된 경우) | 55325 / 55326 |
| Analytics / vector | 55327 / 55328 |
| Pooler (활성화한 경우) | 55329 |
| Edge inspector | 55383 |

```bash
git pull --ff-only origin work/actions-paused-batch-20261008
for port in 55320 55321 55322 55323 55324 55325 55326 55327 55328 55329 55383; do
  lsof -nP -iTCP:"$port" -sTCP:LISTEN
done
supabase start
supabase test db --local
node scripts/hero-local.mjs qa --with-db
```

포트 점검 결과 다른 프로세스가 출력되면 해당 서비스를 강제 종료하지 말고 포트 재배치를 검토한다. `supabase status`의 로컬 URL/키는 비밀값이므로 전체 출력을 공개하지 않는다. `supabase test db --local` 및 `qa --with-db`는 로컬 DB만 대상으로 실행하며, 원격 Supabase 링크와 DB는 변경하지 않는다.

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
# 사전 구성 검증 후, 사람이 외부 업로드를 명시적으로 승인한 경우에만:
node scripts/hero-local.mjs preview --project=hero --preview-branch=qa-local --confirm-preview
node scripts/hero-local.mjs smoke --url=https://qa-local.hero-dnr.pages.dev
```
실제 Cloudflare Pages **프로젝트명은 `hero`**, 기본 **도메인은 `hero-dnr.pages.dev`**다. 둘은 다르므로 CLI 옵션에 `hero-dnr`을 프로젝트명으로 넣지 않는다. 이 스크립트는 `hero` 프로젝트와 `qa-*` Preview만 허용하며, 실제 업로드는 사용자 승인 전 수행하지 않는다.

Cloudflare Branch control에서 **Production branch=`main`**, **Production 자동 배포=Enabled**, **Preview branch=None**으로 설정한 화면을 확인했다. 설정이 저장됐는지는 화면을 닫았다 다시 열어 확인한다. Preview 자동 배포가 꺼져도 `wrangler pages deploy` 수동 배포는 별도로 가능하다. `main`에 커밋하면 Production 자동 배포가 일어날 수 있으므로 금지한다.

배포 사전차단: 청결한 정확한 로컬 브랜치, origin 추적 SHA 일치, 24시간 이내 `qa --with-db` PASS, 빌드 파일 해시/환경파일 해시 동일, preflight 통과, 프로젝트/브랜치 이름 검증, 명시적 `--confirm-preview`가 모두 필요하다. Cloudflare는 미리보기 브랜치만 배포한다. 스모크 테스트는 별도 명령으로 돌린다.

Cloudflare Git 통합을 유지하는 경우, **Workers & Pages → 프로젝트 → Build → Branch control**에서 자동 production/preview 배포를 중단하고 직접 Wrangler 배포만 사용하도록 설정할 수 있다. GitHub Actions를 중단해도 Cloudflare 자체 Git 자동 배포는 별개의 설정이다.

## 5. 아직 하지 않은 일
- 사용자 MacBook에서 Wrangler 4.148.0 설치·로그인·Pages 목록 조회는 성공했다. 전체 로컬 `qa --with-db`도 `eb5e6e1b`에서 PASS했다. 다만 이 변경으로 커밋 SHA가 달라지므로 다음 Mac QA가 필요하다. **외부 Cloudflare 업로드, 원격 Supabase DB 스키마 변경, 실제 운영 롤아웃은 이 대화에서 실행하지 않았다**.
- 기존 릴리스 문서의 법무·실기기·시나리오·파일럿 승인 게이트는 별도로 유지한다. 미리보기 배포 PASS는 production 출시 승인이 아니다.
- `main`, PR #79, GitHub Actions, Supabase 원격 DB, Cloudflare 현재 서비스 배포를 변경하지 않았다.
