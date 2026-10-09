# HERO — Deno lockfile로 인한 QA 종료 검사 오탐 수정

2026-10-08 · 개발 브랜치 `work/actions-paused-batch-20261008`

## 실행 로그에서 관찰한 사실

Mac `node scripts/hero-local.mjs qa --deep --with-deno --with-db`에서 게임 엔진 19·웹 300·Chromium 7·Deno 22개 테스트 및 Edge Deno typecheck 9개, pgTAP 417개가 성공했다. 마지막 종료 검증에서 다음 3개 Deno 자동 생성 파일만 untracked로 남아 실패했다.

```text
?? supabase/functions/admin-scenario/deno.lock
?? supabase/functions/deno.lock
?? supabase/functions/submit-session/deno.lock
```

이는 QA 완료 **직전**의 Git 작업 트리 clean gate 문제다. 기존의 `LOCAL_QA_PASS` 증거가 생성되지는 않았다.

## 변경

`.gitignore`에서 실제 자동 생성된 위 3개 경로만 제외한다. 자동 생성 파일을 `rm`하거나 `git clean -fdx`로 파괴하지 않는다. `scripts/hero-local.test.mjs`에 `git check-ignore --no-index --quiet`로 정확한 3개 경로의 무시 및 다른 lockfile 경로의 비무시를 확인하는 회귀시험을 추가한다.

Deno lockfile을 의존성 잠금으로 추적할지 여부는 별도의 재현성 정책 검토 대상이며, 이번 변경은 Mac 로컬 QA를 방해하는 임시 생성물만 다룬다.

## 재실행

```bash
git pull --ff-only origin work/actions-paused-batch-20261008
node --test scripts/hero-local.test.mjs
git status --short
node scripts/hero-local.mjs qa --deep --with-deno --with-db
```

목표 종료 출력:

```text
LOCAL_QA_PASS sha=<새 GitHub SHA> db=tested
QA_SCOPE deep=checked deno=checked full_mobile_flow=NOT_RUN
```

`main`, PR #79, GitHub Actions, Cloudflare 배포, 원격 Supabase DB는 변경하지 않는다.
