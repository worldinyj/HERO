# HERO — Cloudflare Pages 미리보기 목적지 확정 및 가드

2026-10-08 / 개발 브랜치 work/actions-paused-batch-20261008

## 원인
Mac의 `wrangler pages project list` 확인 결과 **Cloudflare 프로젝트 slug는 `hero`**이지만 기본 `pages.dev` 도메인은 **`hero-dnr.pages.dev`**다. 기존 `scripts/hero-local.mjs preview --project=hero`는 프로젝트 slug에서 `qa-local.hero.pages.dev`를 구성해 잘못된 미리보기 도메인을 검사했다.

## 해결
- 목적지 프로젝트를 `hero`로 제한하여 실수로 다른 Pages 프로젝트에 업로드하지 못하도록 한다.
- Preview 도메인은 실제 기본 도메인에 branch prefix를 적용한 `https://qa-local.hero-dnr.pages.dev`다.
- `smoke`에서 다른 Pages 도메인, `main`, HTTP, userinfo, 임의 포트, 추가 URL path/query/fragment를 거부한다.
- 스크립트 회귀시험에 잘못된 slug/도메인 조합과 잘못된 URL을 포함한다.
- 기존 QA 증거는 저장 SHA와 일치하지 않아 자동으로 Preview 단계에서 거부된다. 현재 파일 `apps/web/.env.production.local`이 아직 없으므로 배포 준비 완료 상태는 아니다.

## 현재 외부 환경
- Cloudflare production branch는 `main`, 자동 Production은 Enabled.
- Branch control UI에서 Preview=None을 선택한 상태 확인, **저장 확인은 사용자가 재진입 확인**.
- 외부 HERO Supabase는 최신 로컬 24개에 비해 migration 15개만 적용된 상태로 확인돼 최신 코드의 스테이징 백엔드로 즉시 사용하면 안 된다.
- 현재 로컬의 PostgreSQL pgTAP 417/417, 전체 QA `eb5e6e1b` 기준 PASS. 변경된 SHA에서는 다시 QA 실행해야 한다.

## 이후
1. 사용자는 Cloudflare Branch control Preview=None 저장 여부를 확인한다.
2. 별도 스테이징 Supabase 구성 및 필요한 Kakao 도메인/JS Key를 확인한다.
3. 비밀키를 Git에 추가하지 않고 로컬 `apps/web/.env.production.local`을 준비한다.
4. `node scripts/hero-local.mjs qa --with-db`를 새로운 SHA 기준 재실행한다.
5. 명시적 업로드 승인 이후에만 `node scripts/hero-local.mjs preview --project=hero --preview-branch=qa-local --confirm-preview`를 실행한다.
6. `node scripts/hero-local.mjs smoke --url=https://qa-local.hero-dnr.pages.dev`로 점검한다.

GitHub Actions, `main`, PR #79, 외부 Supabase DB, Pages 배포는 이 수정 작업에서 변경하지 않는다.
