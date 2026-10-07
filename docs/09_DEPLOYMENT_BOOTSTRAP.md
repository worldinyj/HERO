# HERO — 최초 Admin 부트스트랩 및 배포 준비 가이드

| 항목 | 내용 |
|---|---|
| 문서 상태 | 운영 준비용 |
| 기준일 | 2026-10-07 |
| 관련 Task | T0-05, T0-06, T0-07, T0-10 |
| 핵심 원칙 | **앱 화면이나 일반 API에서 admin을 만들지 않는다** |

## 1. 최초 Admin 부트스트랩 원칙

HERO의 일반 초대 경로는 `plant_manager`와 `player`만 허용한다. `admin`은 초대 링크로 생성할 수 없고, 일반 사용자가 자신의 profile을 수정해 admin으로 승격하는 것도 DB 권한에서 차단한다.

최초 admin은 다음 조건을 만족할 때만 생성한다.

1. Supabase Auth에 대상 사용자가 이미 존재한다.
2. `public.profiles`에 admin 역할이 아직 0명이다.
3. Supabase SQL Editor에서 DB owner 권한으로 `private.bootstrap_initial_admin(...)`을 직접 호출한다.
4. 호출 결과와 `admin.bootstrap_initial` 감사로그를 확인한다.
5. 이후에는 같은 함수가 `admin_already_exists`로 거부되는지 확인한다.

## 2. 실행 절차

### 2.1 대상 Auth 사용자 생성

프로덕션 Kakao Auth 구성이 완료된 뒤 최초 관리자 계정으로 한 번 로그인하여 `auth.users` 레코드를 만든다.

아직 HERO profile이 없기 때문에 일반 앱 기능은 사용할 수 없어도 정상이다.

Supabase Dashboard의 Authentication > Users에서 해당 사용자의 UUID를 확인한다.

### 2.2 마이그레이션 적용

모든 마이그레이션이 적용되어 아래 함수가 존재하는지 확인한다.

`private.bootstrap_initial_admin(uuid, text, text)`

### 2.3 SQL Editor에서 1회 실행

아래 값만 실제 관리자 정보로 바꿔 실행한다.

```sql
select private.bootstrap_initial_admin(
  'AUTH_USER_UUID_HERE'::uuid,
  '관리자 실명',
  'HEROADMIN'
);
```

닉네임 규칙:
- 2~12자
- 한글/영문/숫자만
- 금칙어 포함 불가
- 기존 닉네임과 대소문자 무시 중복 불가

### 2.4 검증

```sql
select id, role, real_name, nickname, is_active, plant_id, job_role
from public.profiles
where role = 'admin';

select action, actor_user_id, created_at, metadata
from public.audit_logs
where action = 'admin.bootstrap_initial'
order by created_at desc;
```

정상 상태:
- admin profile 정확히 1건
- `plant_id is null`
- `job_role is null`
- `is_active = true`
- 감사로그 1건 이상

### 2.5 재실행 방지 확인

다른 Auth UUID로 같은 함수를 호출하면 반드시 다음 오류가 발생해야 한다.

`admin_already_exists`

## 3. 금지사항

- 브라우저 콘솔이나 앱 코드에서 profile role을 직접 UPDATE하지 않는다.
- `service_role`을 브라우저 환경변수에 넣지 않는다.
- admin 초대 링크 기능을 추가하지 않는다.
- 기존 player/plant_manager profile을 SQL로 즉석 승격하지 않는다.
- 최초 admin 생성 후 bootstrap 함수를 일반 API에 노출하지 않는다.

현재 함수는 `private` schema에 있고 `public`, `anon`, `authenticated`, `service_role`의 execute 권한을 모두 제거한다. SQL Editor의 DB owner만 실행하는 운영 절차로 유지한다.

## 4. 외부 서비스 배포 체크리스트

### Supabase

- [ ] staging / production 프로젝트 확정
- [ ] 모든 migration 적용
- [ ] Edge Functions 배포
- [ ] Kakao Auth provider 활성화
- [ ] `Allow users without an email` 활성화
- [ ] Site URL / Redirect URL을 실제 Cloudflare 도메인과 일치
- [ ] 최초 Auth 사용자 생성 후 이 문서의 admin bootstrap 실행
- [ ] RLS / pgTAP CI 전체 PASS 확인

### Cloudflare Pages

- [ ] GitHub `worldinyj/HERO` 연결
- [ ] 빌드 명령과 출력 디렉터리 확인
- [ ] `VITE_SUPABASE_URL`
- [ ] `VITE_SUPABASE_ANON_KEY`
- [ ] `VITE_KAKAO_JS_KEY`
- [ ] SPA deep-link 새로고침 확인
- [ ] `_headers` 보안 헤더 확인
- [ ] PR preview 도메인 동작 확인

### Kakao Developers

- [ ] JavaScript 키 확인
- [ ] 실제 서비스/preview 도메인을 JavaScript SDK domain에 등록
- [ ] 메시지 링크가 열릴 Web domain 등록
- [ ] Supabase Kakao OAuth redirect URI 등록
- [ ] 이메일/프로필을 불필요하게 필수 동의항목으로 요청하지 않음
- [ ] 담당자 화면에서 카카오톡 공유 실기기 확인

## 5. 자동 배포 Preflight

실제 외부 서비스 값을 Git에 커밋하지 않고 로컬 비추적 환경파일로 사전검사한다.

예시:

```bash
cp apps/web/.env.example .env.staging
# .env.staging에 실제 staging 값을 입력
pnpm check:deployment-preflight -- \
  --env-file=.env.staging \
  --strict
```

`.env.staging` 예시 항목:

```dotenv
HERO_APP_URL=https://hero-staging.example.com
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-or-publishable-key>
VITE_KAKAO_JS_KEY=<javascript-key>
```

검사는 다음을 확인한다.

- 서비스 URL과 Supabase URL이 HTTPS인지
- 브라우저용 Supabase key가 비어 있지 않고 service-role/secret key가 아닌지
- Kakao JavaScript key가 설정되었는지
- 저장소의 `_headers`, PWA manifest, 환경변수 예제가 존재하는지
- 등록해야 할 Kakao JavaScript SDK domain / Product Link Web domain 계산
- Kakao REST API Redirect URI용 Supabase callback 계산
- Supabase Site URL / Redirect allow-list 계산

현재 Supabase Kakao OAuth callback 표준형식은 다음과 같다.

```text
https://<project-ref>.supabase.co/auth/v1/callback
```

네트워크까지 확인하려면:

```bash
pnpm check:deployment-preflight -- \
  --env-file=.env.staging \
  --strict \
  --live
```

`--live`는 서비스 URL과 Supabase Auth health endpoint를 실제로 호출한다. 키 값 자체는 출력하지 않는다.

JSON 결과가 필요한 경우:

```bash
pnpm check:deployment-preflight -- \
  --env-file=.env.staging \
  --json
```

CI에서는 실제 운영 키 없이 validator 자체의 good/bad fixture를 `--self-test`로 지속 검증한다.

## 6. 배포 전 최종 사용자 확인 필요

다음은 코드로 대신할 수 없는 운영 결정이다.

- Supabase staging/prod 프로젝트 소유권
- Cloudflare Pages 프로젝트 및 최종 도메인
- Kakao Developers 앱/플랫폼 키
- 개인정보 처리방침의 운영주체·보유기간·담당부서
- 파일럿 발전소와 대상 인원
- OPIS 근거사건 PDF 및 사용조건 확인
- 승인된 BGM/SFX 자산

이 항목이 확정되기 전에는 내부 개발/스테이징 검증까지만 진행하고 프로덕션 공개는 하지 않는다.


## 7. GitHub staging smoke workflow

실제 staging 프로젝트와 도메인이 준비되면 로컬 명령을 반복하지 않고 GitHub Actions의 **Staging Smoke** workflow를 수동 실행한다.

### 7.1 GitHub Environment 생성

Repository → Settings → Environments에서 `staging` environment를 만들고 다음 Secrets를 등록한다.

- `HERO_STAGING_URL` — 예: `https://hero-staging.example.com`
- `HERO_STAGING_SUPABASE_URL` — staging Supabase project URL
- `HERO_STAGING_SUPABASE_ANON_KEY` — 브라우저용 anon/publishable key만 허용
- `HERO_STAGING_KAKAO_JS_KEY` — Kakao JavaScript key

`service_role`, `sb_secret_...` 등 서버 비밀키는 이 workflow에 등록하지 않는다.

필요하면 `staging` environment에 required reviewer를 설정해 외부 네트워크 검증이 승인 없이 실행되지 않도록 한다.

### 7.2 실행

GitHub → Actions → **Staging Smoke** → Run workflow.

workflow는 순서대로 다음을 확인한다.

1. 4개 staging Secret 존재 여부
2. 기존 deployment preflight의 URL/key 형식 및 Supabase Auth live health
3. `/`, `/login`, `/privacy`, `/terms`, `/leaderboard` deep-link가 SPA shell로 HTTP 200 응답
4. Cloudflare `_headers`의 핵심 보안 헤더
5. `manifest.webmanifest`과 `sw.js`의 실제 배포 상태
6. staging Supabase의 `peek-invite` Edge Function이 HERO 형식의 `invitation_not_found` 응답을 반환하는지
7. preflight/HTTP 결과 JSON을 Actions artifact로 14일 보관

### 7.3 로컬 동일 검사

배포된 URL만 빠르게 확인할 때:

```bash
pnpm check:staging-http -- \
  --app-url=https://hero-staging.example.com \
  --strict
```

validator 자체 회귀검사는 외부 네트워크 없이 실행 가능하다.

```bash
pnpm check:staging-http -- --self-test
```

### 7.4 판정

Staging Smoke가 PASS해도 다음 항목은 별도 사람 확인이 남는다.

- 실제 Kakao 로그인/공유(특히 Kakao 인앱 브라우저)
- Android Chrome/Samsung Internet/iOS Safari 실기기
- 사내망/개인폰 접속 정책
- 개인정보/법무 승인
- 경쟁 시나리오 사람 승인
- 파일럿 운영

즉 이 workflow는 **외부 배포 구성과 웹/Edge 기본 동작을 자동 검증하는 staging gate**이며 프로덕션 출시 승인 자체를 대신하지 않는다.


## 8. Release Candidate Gate

실제 릴리스 승인 직전에는 [11_RELEASE_EVIDENCE.md](11_RELEASE_EVIDENCE.md)의 절차를 따른다.

핵심 순서:

1. `ops/release-evidence.json`에 법무/개인정보, 외부배포, 실기기, 사내망, 파일럿 증거를 기록
2. 오디오 정책을 `deferred`에서 `excluded` 또는 `included`로 확정
3. 릴리스 대상 **동일 main SHA**를 staging에 배포
4. GitHub Actions → **Staging Smoke** 실행 및 PASS
5. GitHub Actions → **Release Candidate Gate** 실행
6. 입력값 `staging_smoke_run_id`에 바로 앞 성공 run ID 입력
7. workflow가 Staging Smoke의 이름·성공결론·main branch·**head SHA 정확 일치**를 GitHub API로 재검증
8. strict release evidence/readiness, scenario source·cause traceability·approval/hash, audio scope, production build를 모두 확인
9. 생성된 90일 보존 RC evidence artifact를 최종 승인자료에 첨부

Release Candidate Gate는 production 배포를 실행하지 않는다. 배포 승인과 실제 production 전환은 조직의 승인 절차에 따라 별도로 수행한다.
