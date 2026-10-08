# HERO — macOS Supabase 동시 실행 포트 분리

2026-10-08 · `work/actions-paused-batch-20261008`

## 증상 및 식별
MacBook Docker의 `supabase_db_johnny-fiction`이 `0.0.0.0:54322`를 점유하고 `supabase_kong_johnny-fiction`은 `54321`, `supabase_inbucket_johnny-fiction`은 `54324`를 점유한다. 별도로 `open-webui`는 `3000`을 사용한다.

HERO의 `supabase start`는 PostgreSQL 이미지 다운로드 이후 `Bind for 0.0.0.0:54322 failed: port is already allocated`로 중단됐다. 코드·마이그레이션 테스트 실패가 아니라 호스트 포트 충돌이다.

## 결정
- Johnny Fiction 및 Open WebUI 프로세스·컨테이너는 변경하지 않는다.
- 실험적인 `supabase stack` 기능은 사용하지 않고 기존 CLI의 `start/status/test db --local` 동작을 유지한다.
- HERO의 `supabase/config.toml`에 55320~55329 포트 대역과 Edge inspector 55383을 설정한다.
- API URL은 `http://127.0.0.1:55321`, DB 주소는 `127.0.0.1:55322`, Studio는 `http://127.0.0.1:55323`이다.
- 온라인 Supabase 프로젝트의 주소·키는 변경하지 않으며 `main`, PR #79, GitHub Actions, Cloudflare 운영 배포도 변경하지 않는다.

## 재검증 계획
Mac 사용자가 브랜치를 fast-forward한 후 새 포트 점유를 확인하고 `supabase start`를 수행한다. 이후 `supabase test db --local`과 `node scripts/hero-local.mjs qa --with-db`로 실제 PostgreSQL/pgTAP 검증을 실행한다.

**포트 분리 설정만 작성됨. Mac 실환경 시작 및 pgTAP은 아직 실행 검증 전.**
