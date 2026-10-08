# HERO — 390px·360px 모바일 전체 E2E 실행 가이드

2026-10-08; 작업 브랜치 work/actions-paused-batch-20261008

## 현재 상태

8654f5a9에서 deep Deno DB QA PASS. 사용자 Mac에서 로컬 E2E 환경 사전점검 PASS.
이번 변경에서 Edge probe/fixture seed/Playwright를 연결하는 스크립트만 구현했으며 Mac 실행은 아직 하지 않았다.

## 1. Edge Functions 시작 (Mac 터미널 A)

```bash
mkdir -p .hero-local
printf 'SITE_URL=http://127.0.0.1:4173\n' > .hero-local/mobile-e2e-edge.env
supabase functions serve --env-file .hero-local/mobile-e2e-edge.env
```

사용 중인 Supabase DB를 초기화하거나 재시작하지 않는다. Ctrl+C로 Edge Functions만 종료 가능.

## 2. 무변경 HTTP 확인 (Mac 터미널 B)

```bash
git pull --ff-only origin work/actions-paused-batch-20261008
node --test scripts/hero-local.test.mjs
node scripts/hero-mobile-e2e.mjs edge-check
```

성공 메시지는 HERO_EDGE_CHECK_PASS invalid_token=400 cors=4173.
token='short' 검사는 요청 본문을 토큰 길이 조건에서 거부하므로 Supabase DB에 접근하지 않는다.
Edge 서버가 실행되지 않았거나 SITE_URL이 다른 경우 서버가 응답하더라도 실패한다.

## 3. 신규 SHA에서 최종 로컬 QA

```bash
node scripts/hero-local.mjs qa --deep --with-deno --with-db
```

## 4. 명시적 로컬 테스트 데이터 생성과 2개 모바일 프로젝트 실행

사전점검과 Edge HTTP가 PASS이고 기존 HERO 로컬 DB에 이 fixture를 만든 적이 없으며
로컬 fixture 데이터 생성에 동의한 경우에만 다음을 실행한다:

```bash
node scripts/hero-mobile-e2e.mjs run --confirm-local-fixture-seed
```

동작: 최신 SHA/24시간 이내 QA 증거 확인 → 임시 랜덤 패스워드 3종 생성 →
로컬 55321에만 고정 fixture 최초 생성 → 390x844 및 360x800 Playwright 실행.
Browser/Vite 프로세스에는 service-role key를 전달하지 않는다.
Vite 기존 서버 재사용을 비활성화하며, 4173 포트가 사용 중이면 임의 서버로 테스트하지 않고 중단한다.

## 실패 시

- fixture 최초 생성이 중간에 실패하면 일부 Auth/DB 행이 남을 수 있다.
- 고정된 fixture UUID/email이 존재하면 충돌 사전검사로 재실행은 중지된다.
- DB 초기화·삭제·자동 정리·원격 작업을 수행하지 않는다.
- 비밀번호는 로그에 출력하지 않으며 실행을 넘겨 저장하지 않는다. 따라서 실패 후 이어서 테스트하는 작업에는 fixture 복구 절차가 따로 필요하다.
- `HERO_FULL_MOBILE_E2E_PASS`가 실제로 출력되기 전에는 E2E 완료로 기록하지 않는다.

본 절차는 Kakao 실제 OAuth나 외부 배포 테스트를 대신하지 않는다.

## Supabase Auth 고정 ID 사전정합성

Auth 관리자 createUser에 지정하는 테스트 사용자 ID 11개를 UUID v4 형태로 변경한다.
생성 이전에 11개 전체 ID 규격을 검사하며, Auth 응답의 사용자 ID가 지정 ID와 다르면 중단한다.
기존 계정/fixture는 삭제하지 않으며 부분 실행 실패 시 자동 초기화도 하지 않는다.
이 변경 이후 새 SHA에서 로컬 QA를 다시 통과시킨 다음에만 실제 fixture 생성을 허용한다.
