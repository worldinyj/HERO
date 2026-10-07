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

## 5. 배포 전 최종 사용자 확인 필요

다음은 코드로 대신할 수 없는 운영 결정이다.

- Supabase staging/prod 프로젝트 소유권
- Cloudflare Pages 프로젝트 및 최종 도메인
- Kakao Developers 앱/플랫폼 키
- 개인정보 처리방침의 운영주체·보유기간·담당부서
- 파일럿 발전소와 대상 인원
- OPIS 근거사건 PDF 및 사용조건 확인
- 승인된 BGM/SFX 자산

이 항목이 확정되기 전에는 내부 개발/스테이징 검증까지만 진행하고 프로덕션 공개는 하지 않는다.
