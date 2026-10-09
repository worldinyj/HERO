# HERO — 전체 모바일 E2E fixture 로컬 전용 차단 및 Actions 로그 보안

2026-10-08 · `work/actions-paused-batch-20261008`

## 문제

`e2e/setup-local.ts`는 전달된 `SUPABASE_URL`/`API_URL`에 대해 service-role key로 Auth 유저 11개, 발전소, 초대, 프로필, 시나리오, 시즌 fixture를 생성한다. 이 스크립트에는 원격 DB URL 거부 조건이 없었다. 기본 QA는 현재 이 경로를 호출하지 않지만 전체 모바일 E2E 준비 단계에서 실수로 원격 DB를 변경할 위험이 있었다.

`.github/workflows/e2e.yml`은 이전에 실패할 때 `/tmp/hero-supabase.json`을 artifact에 포함하거나 환경 값 누락 시 `/tmp/hero-supabase.env` 내용을 CI 로그로 출력할 수 있었다. Supabase status 출력에는 service-role key가 포함된다.

## 수정

- `e2e/localTargetGuard.mjs`의 `localE2eSeedGate`는 아래 모두를 필수로 한다.
  - `HERO_E2E_ALLOW_FIXTURE_SEED=1` 명시적 fixture 생성 승인
  - `http://127.0.0.1:55321` **정확한** HERO 로컬 Supabase API origin
  - `SUPABASE_URL`과 `API_URL`이 둘 다 있으면 일치
  - 충돌 없는 service role key, 서로 다른 충분한 길이의 임시 E2E 비밀번호 3종
- `e2e/setup-local.ts`에서 `createClient()` 호출이나 DB write 전에 이 가드를 실행한다.
- E2E workflow에 fixture 승인 환경 변수만 설정하고, 민감한 로컬 status 파일을 artifact에 포함하지 않는다. GitHub Actions를 실행한 것은 아니며 앞으로도 개발 중 수동 실행은 지양한다.
- Node 테스트에서 원격 HERO, Johnny Fiction 포트, HTTP URL 변조, 서비스키 충돌 등을 모두 거부하는지 검사.

## 남은 일

- Mac의 안전한 로컬 샌드박스와 Edge Functions serve를 준비한 뒤, 사용자가 승인한 환경에서만 fixture 생성/전체 모바일 E2E 실행
- fixture는 ID가 고정돼 있으므로 현재 DB를 초기화하거나 기존 데이터를 삭제하지 말고 재실행 실패 시 별도로 점검한다
- `qa --deep --with-db`는 이미 통과했지만 새 커밋에는 Mac 재검증 필요
- Edge Deno `--with-deno` 별도 검증 필요

## Mac 확인

```bash
git pull --ff-only origin work/actions-paused-batch-20261008
node --test scripts/hero-local.test.mjs
command -v deno && deno --version
```

가드 추가만으로 데이터를 생성하지 않는다. E2E fixture 생성을 하려면 명시적 flag + 민감한 키 설정 + 사전에 격리된 HERO 로컬 DB가 필요하다.
