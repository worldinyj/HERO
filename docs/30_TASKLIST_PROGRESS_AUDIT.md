# HERO TASKLIST 실제 진행 감사 — 2026-10-08

> 기준: `docs/04_TASKLIST.md` v1.4, 브랜치 `work/actions-paused-batch-20261008`, 점검 SHA `fc25dde8f3ae2c894fd3a5243c8a66301cc526a7`  
> **코드 구현 진도 측정 / 실제 최신 CI·pgTAP·E2E 통과 기록 아님 / RELEASE BLOCKED**

## 1. 요약

- MVP Phase 0~7 **86개**: 코드·구성 구현 **52**, 부분 구현·검증 대기 **26**, 미착수·완료 증거 없음 **8**.
- 코드 진도(임의 작업관리 가중치): `(구현×1 + 부분×0.5 + 미착수×0) / 86` = **75.6%**. 작업 난이도/실제 공수 가중치가 아닌 단순 추정 지표.
- **Tasklist DoD**는 코드 리뷰·테스트 통과·360px 모바일 확인·관련 문서 갱신을 모두 요구한다. 아래의 “구현”은 **DoD 최종 완료**를 뜻하지 않는다.
- 실제 Production 출시, 파일럿, 실기기·사내망 승인, 법무·개인정보 승인, 경쟁 시나리오 3종 사람 승인: **완료 아님**.
- Migration 016~024는 **원격 staging 미적용**. 이 최초 감사 당시에는 pgTAP이 실행되지 않았지만, 2026-10-08 Mac 로컬 PostgreSQL에서 **17개 파일/417건 전부 PASS**를 이후 확인했다. 별도 Deno·전체 초대~플레이 모바일 E2E·GitHub Actions는 여전히 미실행.
- 오디오 생성물은 없다. 오디오 런타임은 코드 구현이나 `ops/release-evidence.json`의 `audioPolicy=deferred`는 출시 차단.

## 1.1 이후 보안/실행계약 개발 추가 (기준 진도율 유지)

- 2026-10-08 후속 개발: `supabase/functions/_shared/submissionInput.ts`, `submit-session/index.ts`에서 T5-03 세션 제출 JSON 행동 로그 4종·필수 ID 타입/길이·250건 제한·학습 소감 플래그를 사전 검증. 잘못된 JSON은 `400 invalid_submission`, 게임 엔진의 잘못된 경로는 `409 action_log_rejected`로 분리하고 내부 예외 메시지를 반환하지 않음.
- `submissionInput.test.ts` Deno 회귀 테스트 4그룹 작성, 장래 CI 단계 등록. **같은 GitHub 소스의 로컬 복제본에서 strict `tsc` PASS 및 Node22 Deno shim 4/4 PASS**. 단 실제 Deno·전체 웹/Edge/DB 통합테스트는 미실행.
- **T5-03은 기존 '부분' 상태 유지**, Phase 5 및 MVP 가중 진도 75.6% 역시 변경하지 않음. 최신 전체 DoD/실제 E2E를 검증하기 전 구현 산출물만으로 상태를 승격하지 않음.
- `docs/31_SUBMISSION_INPUT_VALIDATION.md`는 실제 시나리오 응답·오프라인 제출 큐·비활성 발전소까지 포함한 잔여 검증 목록.

## 1.2 2026-10-08 Mac 실행 확인 기록 (기준 진도율 유지)

- 사용자 제공 터미널 기록: `LOCAL_QA_PASS sha=eb5e6e1b01869d1d1c67ad261eb89f8c3cdce6e4 db=tested`, 로컬 `supabase test db --local`은 **Files=17, Tests=417, Result: PASS**. 같은 QA의 Playwright IndexedDB 동시 탭 시나리오 **7/7 PASS**.
- 사용자 제공 터미널 기록: `c97753742f96006333ff0efe7cdc4eb425018d4c` 기준 `node --test scripts/hero-local.test.mjs` **6/6 PASS**. 이 SHA에서 **전체 QA 재실행은 아직 미확인**.
- **범위 제한**: 실제 PostgreSQL 로컬 테스트와 2탭 원자성 Playwright 통과이지, Deno CLI 체크·시나리오 출처 및 사람 승인·전체 초대→플레이 E2E·실기기 테스트나 원격 staging PASS는 아니다.
- 따라서 T1-03, T5-03, T5-04, T7-01 등 구현 상태·환산 진도는 자동 승격하지 않으며, 증거가 확인된 항목의 "미실행" 표기만 정정한다.
- 2026-10-08 이후 추가한 `qa --deep`는 시나리오·원인 추적성·릴리스 증거·법무·오디오·정적 보안 검사를 로컬에서 실행한다. `qa --with-deno`는 실제 Deno를 요구한다. **새 모드에 대한 Mac 성공 근거는 아직 없다.**

## 1.3 로컬 모바일 E2E fixture 안전장치 (인증 E2E는 미실행)

- `e2e/setup-local.ts`가 환경변수로 전달된 URL에 `auth.users`, `plants`, `profiles`, `invitations`, `scenarios` 등을 생성하므로 오지정시 원격 DB 변경 위험이 있었다.
- 새 `localTargetGuard.mjs`는 HERO 전용 `http://127.0.0.1:55321`과 명시적 `HERO_E2E_ALLOW_FIXTURE_SEED=1` 없이는 **데이터 생성 전에 중단**한다. Johnny Fiction 로컬 API(54321)도 거부한다.
- GitHub Actions E2E는 미래 수동/정책 활성화 시에만 이 플래그를 지정하고, failure artifact에 Supabase 상태 JSON을 저장하지 않는다.
- **전체 모바일 E2E 및 실제 Edge 서비스는 아직 실행되지 않았으며**, T7-01 상태는 부분 구현 유지한다.

## 1.4 Deno 포함 전체 로컬 QA 통과 및 모바일 E2E fixture 안전성

- 사용자 Mac 로그: `LOCAL_QA_PASS sha=6d572c8a5edbfa1579fae042830bfb47bb9195f2 db=tested`, `QA_SCOPE deep=checked deno=checked full_mobile_flow=NOT_RUN`.
- 엔진 19건, 웹 300건, Deno 단위테스트 22건·Edge check 9건, Chromium IndexedDB 7건, pgTAP 417건 모두 통과.
- 신규 `e2e/fixtureNamespace.mjs`는 데이터 쓰기 전에 고정 UUID, Auth 이메일, 발전소 코드, 시나리오 slug, 시즌 key 충돌을 읽기 전용으로 검사한다. 기존 데이터가 있거나 조회가 실패하면 중지.
- 테스트용 `e2e-season`은 별도 생성하며 실제 월간 open 시즌을 재사용하지 않는다. `e2e:setup` 실행 스크립트는 이미 root package.json에 존재하여 추가 변경하지 않았다.
- 모바일 전체 플로우는 아직 미실행. 부분적 fixture 생성과 재실행 cleanup은 여전히 별도 문제이며, 데이터 초기화를 자동 수행하지 않는다.

## 1.6 전체 모바일 E2E 로컬 실행 게이트 준비

- 기존 `8654f5a9`: 사용자 Mac 전체 deep Deno DB QA PASS.
- 사용자 확인: `079ea6fb` 로컬 E2E 환경 사전점검 PASS (실행 로그 별도 미첨부).
- 신규 `hero-mobile-e2e.mjs`: `edge-check`는 쓰기 없는 POST invalid_token 검사/CORS 검증, `run --confirm-local-fixture-seed`는 same-SHA QA/로컬 fixture first-use 정책 하에서만 쓰기 및 두 모바일 뷰포트 Playwright 수행.
- `playwright.config.ts`: 이 전체 로컬 E2E에서 기존 Vite 서버 재사용 금지. 브라우저 프로세스에서 Supabase 서비스 키 제거.
- **새 SHA에서 Mac 회귀시험 및 실제 Edge/mobile 전체 테스트는 아직 미실행**. Tasklist T7-01은 `partial` 유지.

## 1.7 로컬 Supabase Edge CORS 프록시 판정 보완

- Mac 확인: `SITE_URL_PASS`였으나 Edge 응답은 POST 400/`invalid_token`이고 CORS는 4173·5173 모두 `*`; 기존 edge-check의 정확한 origin 비교 때문에 false negative.
- 신규 로컬-only 판정: HERO loopback 환경 확인 후에만 `*` 허용. OPTIONS의 POST/Authorization/ApiKey/content-type 사전요청과 wildcard credential 금지를 검증. **실제 Mac 새 검사 PASS는 아직 미확인**, production CORS sign-off가 아니다.
- 모바일 fixture 및 전체 E2E 미생성/미실행 상태 유지, T7-01 partial.


## 1.8 2026-10-09 로컬 전체 모바일 E2E 실제 통과 (사용자 Mac 실행 로그)

> **검증 대상 SHA**: `97e58d5faf6469928d20486d739002ce8a47f783`. 본 항목은 사용자 제공 터미널 출력에 의한 **로컬 실행 증거**이며 GitHub Actions, 원격 staging, 실제 Kakao OAuth, 실기기·법무·파일럿·릴리스 승인 증거가 아니다.

- `node scripts/hero-local.mjs qa --deep --with-deno --with-db`: `LOCAL_QA_PASS sha=97e58d5faf6469928d20486d739002ce8a47f783 db=tested`; `QA_SCOPE deep=checked deno=checked full_mobile_flow=NOT_RUN` (후속 별도 모바일 E2E 수행).
- 코드/브라우저: Node 22/22, 엔진 19/19, 웹 300/300, IndexedDB 7/7, Deno check·test 성공, lint/typecheck/build 성공, 로컬 pgTAP **17개 파일/417건 PASS**.
- 로컬 `peek-invite`: `HERO_EDGE_CHECK_PASS invalid_token=400 cors=wildcard-local options=PASS`. 이는 로컬 와일드카드 CORS 검증일 뿐 운영 CORS 승인이 아니다.
- `node scripts/hero-mobile-e2e.mjs run --confirm-local-fixture-seed`: `E2E_FIXTURE_PREFLIGHT_PASS`, `HERO_LOCAL_FIXTURE_SEED_PASS`, 390×844 및 360×800 각 **3개** Playwright 케이스 통과, 총 **6/6 PASS** 및 `HERO_FULL_MOBILE_E2E_PASS (local only)`.
- 검증 흐름: 관리자→담당자→사용자 초대, 초대 없는 로그인 차단, 초대→플레이→오프라인 제출 큐 재처리→리더보드. 테스트 데이터는 HERO 로컬 DB에 **이미 생성됨**. 고정 fixture를 다시 생성하는 명령은 무조건 재실행하지 말고 충돌/잔존 상태를 먼저 확인한다. DB reset/자동 삭제 금지.
- **상태 판정:** T7-01의 **로컬 에뮬레이션 통합 검증 증거는 충족**. 원본 TASKLIST의 전체 DoD에는 최신 코드 리뷰·실기기 및 운영 검증 등 남은 조건이 있으므로 T7-01은 `partial`, 86항목 관리용 진도율 **75.6% 유지**. 향후 코드 변경 커밋에 기존 SHA 검증을 자동 승계하지 않는다.
- 이번 로그의 release gate는 `not_release_ready`: 경쟁 콘텐츠 승인 0/3, 법무·개인정보, staging/live, 사내망/개인기기, 실기기, 파일럿 등 **7 BLOCKED / 1 DEFERRED**. 오디오 생성물 0건 및 `audioPolicy=deferred`.
- 차기 순서: (1) 로컬 fixture 안전 보존 및 실행 증거 기록 (2) 실제 카카오 OAuth/실기기 테스트 설계 (3) 경쟁 시나리오 전문가 5항목 승인 (4) 개인정보·배포 정책 결정 (5) 승인 후 별도 staging 검증. GitHub Actions 재실행은 사용자 요청대로 보류.

## 2. Phase별 진행

| Phase | 작업 수 | 구현 | 부분 | 미착수 | 환산 진도 |
|---|---:|---:|---:|---:|---:|
| 0 | 10 | 7 | 3 | 0 | 85% |
| 1 | 15 | 12 | 3 | 0 | 90% |
| 2 | 10 | 9 | 1 | 0 | 95% |
| 3 | 13 | 2 | 8 | 3 | 46.2% |
| 4 | 12 | 10 | 2 | 0 | 91.7% |
| 5 | 10 | 7 | 3 | 0 | 85% |
| 6 | 8 | 5 | 3 | 0 | 81.3% |
| 7 | 8 | 0 | 3 | 5 | 18.8% |
| **합계** | **86** | **52** | **26** | **8** | **75.6%** |

## 3. TASKLIST 86개 추적표

판정: **구현**=소스/산출물 존재(최신 종합검증 전) · **부분**=일부 산출물만 존재/핵심 검증 대기 · **미착수**=완료 증거 없음.

| ID | 내용(원본 요약) | 분류 | 근거 파일 | 남은 조건/확인 |
|---|---|---|---|---|
| T0-01 | pnpm 모노레포 스캐폴딩 (`apps/web`, `packages/engine`, | 구현 | `apps/web/package.json` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T0-02 | Vite 8.x + React 19.3+ + TS + Tailwind 4.x + R | 구현 | `apps/web/src/styles.css` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T0-03 | ESLint/Prettier/Vitest/Playwright 설정 | 구현 | `playwright.config.ts` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T0-04 | GitHub Actions CI (lint·typecheck·test·build) | 구현 | `.github/workflows/ci.yml` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T0-05 | Supabase 프로젝트 생성 (staging/prod) 👤 | 부분 | `docs/09_DEPLOYMENT_BOOTSTRAP.md` | staging 연결 확인, production 구성 증거 없음 |
| T0-06 | Cloudflare Pages 연결, SPA fallback 확인·`_headers | 부분 | `apps/web/public/_redirects` | Cloudflare staging 확인; PR 미리보기·보안헤더 실환경 재확인 필요 |
| T0-07 | Kakao Developers 앱 등록(도메인·Redirect URI·최소 동의항목 | 부분 | `apps/web/src/features/auth/LoginPage.tsx` | Kakao 설정 진행; 별도 실제 계정 E2E 미실행 |
| T0-08 | PWA 설정 (manifest, 아이콘, 오프라인 셸) | 구현 | `apps/web/public/manifest.webmanifest` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T0-09 | Kakao JS SDK 연동, 카카오톡 공유 피드 템플릿·OG 이미지 | 구현 | `apps/web/src/lib/kakaoShare.ts` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T0-10 | 최초 admin 부트스트랩 절차(seed/수동 승격) + 공개 관리자 가입 차단 | 구현 | `supabase/migrations/202610070013_initial_admin_bootstrap.sql` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T1-01 | 마이그레이션: enum, plants, profiles(닉네임), invitatio | 구현 | `supabase/migrations/202610070001_phase1_org_auth.sql` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T1-02 | RLS 정책 + `auth_role()/auth_plant()` | 구현 | `supabase/migrations/202610070001_phase1_org_auth.sql` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T1-03 | RLS 통합 테스트 (admin/manager/player × 테이블) | 부분 | `supabase/tests/rls_role_matrix.test.sql` | RLS 역할 매트릭스 포함 로컬 pgTAP 417/417 PASS; 외부 staging·실기기와 최종 DoD 미확인 |
| T1-04 | Edge `create-invite` (권한 검증·1회용 토큰·감사로그·rate l | 구현 | `supabase/functions/create-invite/index.ts` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T1-05 | Edge `accept-invite` (토큰 1회 소비·profiles 생성/동일  | 구현 | `supabase/functions/accept-invite/index.ts` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T1-06 | 로그인 화면 (카카오 로그인) | 구현 | `apps/web/src/features/auth/LoginPage.tsx` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T1-07 | 초대 미리보기 + 온보딩 3단계 (본인확인·닉네임 중복/금칙어·인사평가 무관 동의) | 구현 | `apps/web/src/features/invite/InvitationPage.tsx` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T1-08 | 라우트 가드 `RequireAuth/RequireRole` | 구현 | `apps/web/src/features/auth/RequireAuth.tsx` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T1-09 | 관리자: 발전소 CRUD, 담당자 초대 | 부분 | `apps/web/src/features/admin/AdminOrgPage.tsx` | 생성·활성/비활성 구현, 완전한 CRUD 중 삭제/관리정책 불확정 |
| T1-10 | 담당자: 초대 링크 생성·**카톡 공유**·링크 복사·새 링크·취소·수락자 확인/비 | 구현 | `apps/web/src/features/manager/ManagerDashboardPage.tsx` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T1-11 | 담당자: CSV 일괄 링크 생성 (행별 카톡 공유·링크 CSV 다운로드) | 구현 | `apps/web/src/features/manager/ManagerInvitePanel.tsx` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T1-12 | 이용약관·개인정보 문안 + **"인사평가 무관" 고지 문구 반영**(로그인·온보딩· | 부분 | `docs/07_TERMS_PRIVACY_DRAFT.md` | 약관·개인정보 초안 존재; 법무·개인정보 책임자 승인 미완료 |
| T1-13 | 닉네임 정책: 금칙어 필터, **활성 시즌당 1회** 변경, 담당자 초기화 | 구현 | `supabase/migrations/202610070008_nickname_policy.sql` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T1-14 | `manager_participation_view`·`manager_aggregat | 구현 | `supabase/migrations/202610070005_manager_dashboard.sql` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T1-15 | P0 감사로그 공통 모듈/정책: 초대·수락·권한변경·비활성화·점수조정·시즌마감 기록 | 구현 | `supabase/migrations/202610070009_audit_integrity.sql` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T2-01 | 시나리오 Zod 스키마 + JSON Schema 산출 | 구현 | `packages/schema/src/scenario.ts` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T2-02 | 시나리오 검증 CLI (참조 무결성·도달성·엔딩·길이) | 구현 | `packages/schema/src/validation.ts` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T2-03 | PSF 배수표·Barrier 정의·HU Tool 카드 카탈로그 | 구현 | `packages/engine/src/catalog.ts` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T2-04 | 엔진 코어: createGame/act/getView (Hazard Index 비노 | 구현 | `packages/engine/src/engine.ts` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T2-05 | Hidden **Hazard Index** 판정 + 시즌×시나리오 공통 simula | 구현 | `packages/engine/src/rng.ts` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T2-06 | 5대 학습행동 지표·시나리오 HP(최대310)·score_rule_version 구 | 구현 | `packages/engine/src/score.ts` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T2-07 | breachChain·keyDecision 추적 | 구현 | `packages/engine/src/engine.ts` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T2-08 | replayFrom (결정 지점부터 재시작) | 구현 | `packages/engine/src/engine.ts` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T2-09 | 경로 탐색 시뮬레이터 (전 경로 엔딩 분포·정답편향 경고) | 구현 | `packages/engine/src/simulator.ts` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T2-10 | Deno 호환 빌드 확인 (Edge에서 import) | 부분 | `supabase/functions/start-session/index.ts` | Edge Deno 호환 소스 존재; 최신 Deno check 미실행 |
| T3-01 | OPIS 인적오류 사건 후보 수집 (10~15건 PDF) 👤 | 부분 | `scenarios/research/T3_CANDIDATE_MATRIX_V1.md` | 후보 조사자료 존재; 원본·이용조건 추가 확인 필요 |
| T3-02 | 후보 선별 (PRD §8.2: 의사결정·시스템적 학습성·공개적합성) → S01~S0 | 부분 | `scenarios/research/T3_SOURCE_RIGHTS_REVIEW_V1.md` | S01/S02 SOURCE_HOLD, S03 사람 검토 대기 |
| T3-03 | 사건별 HF 분석 (**Direct Cause·Root Cause·Contribut | 부분 | `scenarios/research/S01_HF_BRIEF_V1.md` | 3개 HF brief 작성, 분야별 사람 검토/승인 미완료 |
| T3-04 | S01 "오늘 오전까지" 시나리오 작성 (scene·대사·익명화) | 부분 | `scenarios/drafts/S01_time_pressure_v1.json` | S01 JSON 초안 존재; 출처·사람 승인 대기 |
| T3-05 | S02 "아마 이 설비가" | 부분 | `scenarios/drafts/S02_equipment_identity_v1.json` | S02 JSON 초안 존재; 출처·사람 승인 대기 |
| T3-06 | S03 "절차와 실제가" | 부분 | `scenarios/drafts/S03_procedure_reality_v1.json` | S03 JSON 초안 존재; HF·익명화 사람 승인 대기 |
| T3-07 | 선택지·비용·효과·카드·엔딩 밸런싱 (3종) | 부분 | `scenarios/research/T3_BALANCE_REPORT_V1.md` | 밸런스 보고서 있으나 경쟁 콘텐츠 승인·실기 검증 남음 |
| T3-08 | 튜토리얼 0장 (조작법 30초) | 구현 | `scenarios/data/S00_tutorial.json` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T3-09 | 콘텐츠 검토: HF 정확성·**개인오류 귀결 방지**·익명화·운전절차 과노출·Haz | 부분 | `scenarios/research/T3_HF_REVIEW_CHECKLIST_V1.md` | 검토 패킷 존재; 검토자 서명·승인 미완료 |
| T3-10 | 아트 에셋 제작 (초상화 6×3, 배경 5, 카드 8, 도장 4) | 미착수 | `docs/03_UXUI.md` | 아트 제작 명세만 확인, 요구된 이미지 실물 6×3 등 없음 |
| T3-11 | 오디오 브리프·prompt pack 작성: BGM 5루프+엔딩 stinger, SF | 구현 | `assets/audio/prompts/AUDIO_PROMPTS_V1.md` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T3-12 | Google Flow Music/Lyria 중심 BGM 생성 + SFX/foley  | 미착수 | `assets/audio/reviews/AUDIO_REVIEW_LOG.md` | 오디오 후보 생성물·provenance 최종 산출물 확인 안 됨 |
| T3-13 | 오디오 HF·권리·기술 QC: 인지부하/경보 혼동/약관/peak/loop 검수 →  | 미착수 | `assets/audio/reviews/AUDIO_REVIEW_LOG.md` | 오디오 승인 MP3/manifest QC 증거 없음 |
| T4-01 | 하단 탭 레이아웃, 캠페인 맵 | 구현 | `apps/web/src/app/App.tsx` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T4-02 | 장 소개(출진) 화면 | 구현 | `apps/web/src/features/play/CompetitiveCampaignChapters.tsx` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T4-03 | `SceneStage`·`DialogueBox` (타이핑·스킵) | 구현 | `apps/web/src/features/play/SceneStage.tsx` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T4-04 | `ChoiceSheet` (2탭 확정, presentation seed 셔플, ac | 구현 | `apps/web/src/features/play/ChoiceSheet.tsx` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T4-05 | `GameClock`, 정보 행동 칩·카드 | 구현 | `apps/web/src/features/play/GameClock.tsx` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T4-06 | `BarrierCardTray` + 사용 연출 | 구현 | `apps/web/src/features/play/components/BarrierCardTray.tsx` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T4-07 | `EventAlert`, 엔딩 도장 4종 | 구현 | `apps/web/src/features/play/components/EventAlert.tsx` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T4-08 | Zustand 게임 스토어 + IndexedDB 자동저장·이어하기 + 오프라인 배너 | 부분 | `apps/web/src/features/play/gameStore.ts` | 로컬/오프라인 저장 구현, 최근 중단 발전소 변경 후 E2E 미실행 |
| T4-09 | 에셋 프리로드·코드분할 | 부분 | `apps/web/src/app/routeModules.ts` | 코드분할 소스 존재, 실제 LCP <2.5초 실측 미확인 |
| T4-10 | `AudioManager` 구현: 사용자 제스처 unlock, BGM crossfa | 구현 | `apps/web/src/features/audio/audioManager.ts` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T4-11 | `AudioSettings`: BGM/SFX 독립 mute·volume·reduce | 구현 | `apps/web/src/features/audio/AudioSettings.tsx` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T4-12 | 오디오 lazy-load/cache: 필수 SFX precache, BGM scen | 구현 | `apps/web/src/features/audio/audioManager.ts` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T5-01 | 마이그레이션: scenarios, scenario_versions, play_ses | 구현 | `supabase/migrations/202610070003_sessions.sql` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T5-02 | Edge `start-session` (버전·시즌 확정, simulation/pre | 구현 | `supabase/functions/start-session/index.ts` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T5-03 | Edge `submit-session` (엔진 재실행·검증·flag) | 부분 | `supabase/functions/submit-session/index.ts` | 제출 함수 코드 존재, 최근 원자성/동시 제출 DB 검증 미실행 |
| T5-04 | 오프라인 제출 큐 | 부분 | `apps/web/src/lib/submissionQueue.ts` | 제출 큐 구현, 최근 오프라인 복구 시나리오 E2E 미실행 |
| T5-05 | `CausalReflection` "어느 시점부터 방어막이 약해졌을까요?" | 구현 | `apps/web/src/features/play/result/CausalReflection.tsx` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T5-06 | `SwissCheeseTimeline` (+ 지점별 리플레이 버튼) | 구현 | `apps/web/src/features/play/result/SwissCheeseTimeline.tsx` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T5-07 | HP 리뷰 (`HpRadar`, 위험요인, 핵심결정, HP 내역) + "학습행동 지 | 구현 | `apps/web/src/features/play/result/HpReview.tsx` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T5-08 | 실사건 공개 화면 | 구현 | `apps/web/src/features/play/result/IncidentDebrief.tsx` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T5-09 | 리플레이 플로우 (replay_of 기록) | 부분 | `apps/web/src/features/play/competitiveReplay.ts` | 리플레이 구현, 수정된 제출 연계 최신 E2E 미실행 |
| T5-10 | 시나리오 JSON 업로드·상태관리 (관리자) | 구현 | `apps/web/src/features/admin/AdminScenarioPage.tsx` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T6-01 | seasons, `v_season_scores`, materialized view  | 부분 | `supabase/migrations/202610070004_leaderboard_seasons.sql` | 시즌/점수 SQL 구현, projection Migration016 이후 미적용 |
| T6-01a | **월별 시즌 자동화**: 매월 1일 00:00 KST 전월 마감·스냅샷·신규 시즌 | 부분 | `supabase/migrations/202610070004_leaderboard_seasons.sql` | 월별 경계 로직/테스트 소스 존재, 실제 경계 DB 재검증 필요 |
| T6-02 | 리더보드 공개 뷰(**닉네임**·발전소·조직직무·HP·전체/발전소/직무/발전소×직무 | 부분 | `supabase/migrations/202610080016_leaderboard_public_projection.sql` | 공개 리더보드 projection 구현, staging 미적용 |
| T6-03 | 리더보드 화면 (전체/발전소/직무, 월 선택, 무한스크롤, 내 순위 고정) | 구현 | `apps/web/src/features/leaderboard/LeaderboardPage.tsx` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T6-04 | 캠페인 헤더 순위·상위% 표시 | 구현 | `apps/web/src/features/leaderboard/CampaignRankCard.tsx` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T6-05 | 내 기록 화면 (개인용 누적 학습행동 프로필·장별 최고 기록·시즌 이력) | 구현 | `apps/web/src/features/profile/ProfilePage.tsx` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T6-06 | 담당자 참여현황: 초대/수락/완료수/최근활동 + 익명 집계(n<5 억제), 개인 점 | 구현 | `apps/web/src/features/manager/ManagerDashboardPage.tsx` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T6-07 | HP Point 밸런스 시뮬레이션 (파밍·리플레이 남용 검토) | 구현 | `scripts/analyze-hp-balance.ts` | 코드·구성 산출물 확인; 최신 배치 전체 회귀검증 전 |
| T7-01 | E2E: 초대링크→카카오 로그인(모킹)→수락→플레이→결과→리더보드 (모바일 뷰포트  | 부분 | `e2e/invite-play-leaderboard.spec.ts` | Playwright 시나리오 존재, 최신 브랜치 CI/E2E 미실행 |
| T7-02 | 실기기 테스트 (**카카오톡 인앱 브라우저**/Android Chrome/Samsu | 미착수 | `docs/14_KAKAO_LIVE_INVITE_VALIDATION.md` | 모바일 실제 기기 4종 검증 증거 없음 |
| T7-03 | 접근성 점검 (WCAG 2.2 AA: 대비·키보드/포커스·스크린리더·글자크기·오디오 | 부분 | `.github/workflows/ci.yml` | 자동 접근성 점검 존재, 실기기·보조기기 검증 대기 |
| T7-03a | 오디오 실기기 QC: autoplay unlock, iOS/Samsung Inter | 미착수 | `docs/06_AUDIO_ASSET_GUIDE.md` | 오디오 실기기/혼동성 사용자 QC 미실행 |
| T7-04 | 보안·프라이버시 점검 (RLS 우회·키 노출·rate limit·담당자 개인성과 역 | 부분 | `docs/12_SUPABASE_SECURITY_ADVISOR_REVIEW.md` | 권한/RLS/secret/rate limit 검사 소스, DB 실행·Security Advisor 확인 대기 |
| T7-05 | 사내망/개인폰 접속 정책 확인 👤 | 미착수 | `docs/10_MVP_READINESS.md` | 사내망·개인폰 접속 정책 승인 증거 없음 |
| T7-06 | 파일럿 발전소 1곳 · 30명 운영 + 사전/사후 설문 👤 | 미착수 | `ops/release-evidence.json` | 파일럿 30명 운영·사전사후 결과 없음 |
| T7-07 | 피드백 반영 · v1.0 릴리스 | 미착수 | `docs/10_MVP_READINESS.md` | 파일럿 전·사람 승인 전이므로 v1.0 릴리스 불가 |

## 3.1 감사 결과 파일 검증

- 원본 86개 ID와 `ops/tasklist-progress.json`의 순서/개수가 정확히 일치하며, 86개 항목에 연결된 실제 근거 파일 75종이 모두 브랜치에 존재하는 것을 확인했다.
- 이것은 근거 **파일이 존재한다**는 검사이며 파일 내용의 모든 요구조건 충족/운영 테스트 통과는 별개다.
- 2026-10-08 원격 Supabase **읽기 전용 점검**: staging schema migrations 001~015 적용, 016~024 미적용. 신규 발전소 생성/상태 RPC 미존재, `plants_admin_write` 구 정책이 여전히 존재. DB/Edge 쓰기 또는 배포를 하지 않았다.
- 격리 환경 검증 명령과 배포 전 차단 기준: `docs/31_BATCH_VALIDATION_EXECUTION_PLAN.md`.

## 4. 권장 실행 순서 (현재 BLOCKER 우선)

1. **P0 — 운영 DB 안전성:** Migration001~024를 격리 DB에 순차 적용하고 모든 RLS/pgTAP 테스트(신규 295선언 포함)를 실제 실행. 발전소 중단/재활성화·초대 세대/동시수락·세션 제출 및 감사 롤백 동시성 재현.
2. **P0 — CI·애플리케이션 정합성:** 현재 배치 브랜치의 `pnpm check:batch-db-contracts`, lint, typecheck, Vitest, Deno test/check, build, Playwright 2개 모바일 뷰포트를 **로컬**에서 순서대로 실행하고 결과 기록.
3. **P0 — 경쟁 콘텐츠 승인:** S03 HF·운전·익명화·Just Culture·debrief 사람 검토, 이어 S01·S02 원문·권리 검증 및 최종 승인. 자동화가 승인자를 대체하지 않음.
4. **P0 — 개인정보/약관:** 운영주체·보유기간·국외이전/처리위탁·담당부서 확정 및 공식 승인. `docs/07_TERMS_PRIVACY_DRAFT.md`의 초안 해제는 승인 뒤 수행.
5. **P1 — 자산 정책:** T3-10 아트 제작 및 오디오 `included/excluded` 공식 결정. 포함 시 T3-12/13 산출물·권리/HF QC 및 실제 파일 확인.
6. **P1 — 환경·실증:** 사용자 승인 후 staging migration/Edge/웹 호환 배포 → Kakao A/B/C 3계정 → 4종 실기기/사내망·접근성 → 1개 발전소 30명 파일럿.
7. **P1 — 출시:** 동일 SHA Staging Smoke/RC Gate와 evidence, Blocker 0 확인 후 v1.0 승인/배포.

## 5. 해석 및 업데이트

- 진도율은 TASKLIST 86개를 동일 가중치로 본 **관리용 코드 진척도**이다. 295 pgTAP은 `plan()` 및 테스트 소스 선언 수이며 실행 통과 개수가 아니다.
- R2-01~16 및 R3+는 86개 모수에 **포함하지 않았다**.
- 정식 완료 판정은 원본 TASKLIST의 DoD와 `ops/release-evidence.json`, `scenarios/research/promotion-status.json`을 함께 확인해야 한다.
- `ops/tasklist-progress.json`을 수정하면 `node scripts/check-tasklist-progress.mjs`로 Task ID 정합성·상태 분류·진도율을 재확인한다. 외부 네트워크와 Actions를 사용하지 않는다.
