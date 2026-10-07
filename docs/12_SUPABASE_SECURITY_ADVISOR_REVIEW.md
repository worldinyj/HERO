# HERO Supabase Security Advisor Review

| 항목 | 내용 |
|---|---|
| 기준일 | 2026-10-08 |
| 대상 프로젝트 | HERO / `alhpooapiokyuxysdzzp` |
| 상태 | **STAGING REVIEW — production approval 아님** |
| 원칙 | Supabase Advisor 경고를 무시하지 않되, 의도된 권한경계를 확인하지 않고 기계적으로 변경하지 않는다. |

## 1. 현재 Advisor 항목

### ERROR — `security_definer_view`

대상:

- `public.v_leaderboard_current_public`
- `public.v_leaderboard_snapshot_public`

두 공개 view는 내부 점수 계산 view와 snapshot 테이블에서 **닉네임 기반 player 전용 리더보드**만 제공한다.

현재 SQL은 다음 방어조건을 둔다.

- 호출자 `private.auth_role() = 'player'`
- current leaderboard는 대상 profile도 `is_active=true`, `role='player'`
- real name, decision log, ending, learning metrics는 공개하지 않음
- plant manager는 개인별 점수 대신 n≥5 집계 RPC를 사용

이 view가 private score source를 읽어야 하므로 단순히 `security_invoker=true`로 변경하면 authenticated 사용자가 private source를 직접 읽을 권한이 없어 기능이 깨질 수 있다. 따라서 Advisor ERROR를 없애기 위한 기계적 속성 변경은 하지 않는다.

**후속 설계 후보:** player 전용 SECURITY DEFINER RPC + 명시적 role guard + pagination으로 view를 대체할 수 있는지 검토한다. 변경 시 현재 frontend query/pagination 계약과 DB policy tests를 함께 변경한다.

## 2. WARN — authenticated SECURITY DEFINER RPC

현재 Advisor가 지적하는 RPC:

- `manager_job_aggregates()`
- `manager_participation_rows()`
- `manager_pending_invites()`
- `manager_player_rows()`
- `my_current_rank()`
- `my_record_summary()`
- `sync_open_season_scenarios()`

현재 구현은 단순 공개 함수가 아니라 각 함수 내부에서 application role / current user / plant scope를 다시 검사한다.

- manager RPC → `plant_manager` 요구 + 호출자 발전소 범위
- `my_current_rank()` → `player` 요구 + `auth.uid()` 자신의 행만 반환
- `my_record_summary()` → 활성 application profile 요구 + 자신의 기록만 집계
- `sync_open_season_scenarios()` → `admin` 요구

따라서 **authenticated EXECUTE 자체는 현재 API 설계의 일부**다. 다만 SECURITY DEFINER 함수는 앞으로도 `SET search_path=''`, 내부 role guard, 최소 반환 필드를 유지하고 pgTAP 회귀검사로 권한경계를 고정한다.

## 3. INFO — RLS enabled, no policy

대상:

- `public.nickname_change_events`
- `public.nickname_forbidden_terms`

두 테이블은 클라이언트 직접 CRUD를 허용하기 위한 테이블이 아니다. RLS + no policy의 기본 거부 동작을 이용하고 Edge Function / privileged path에서만 접근하는 설계다.

현재 INFO는 **의도된 default-deny**로 분류한다. 향후 client SELECT 요구가 생기면 그때 최소 정책을 추가한다.

## 4. Auth leaked-password protection

Advisor는 leaked-password protection 비활성화를 경고한다.

HERO 프로덕션 사용자 인증의 주 경로는 Kakao OAuth이며 브라우저에 일반 password 가입 UI를 제공하지 않는다. 로컬 E2E의 email/password 계정은 로컬 Supabase 테스트용 fixture다.

그래도 Supabase 프로젝트에서 password provider를 실제 운영에 사용할 계획이 생기면 leaked-password protection 활성화를 release checklist에 포함한다.

## 5. 자동 회귀검사

DB policy test는 다음 경계를 유지해야 한다.

- player만 public leaderboard row 조회 가능
- plant manager는 player leaderboard row 조회 불가
- admin도 player public leaderboard view 조회 불가
- manager는 player session / decision log 직접 조회 불가
- player는 자신의 session / decision만 조회
- inactive profile은 application role과 leaderboard 접근 모두 차단
- direct profile update를 통한 role escalation / nickname policy 우회 차단
- audit log immutable

Advisor 경고가 남아 있더라도 이 경계가 깨지는 변경은 merge/배포하지 않는다.

## 6. Production 전 결정사항

1. public leaderboard view를 그대로 유지할지, role-guarded RPC로 대체할지 별도 security review.
2. SECURITY DEFINER RPC별 최소권한/반환필드 재검토.
3. Supabase Advisor를 다시 실행하고 새 ERROR/WARN diff 확인.
4. 실제 player / plant_manager / admin 계정으로 staging 권한 테스트.
5. 결과를 release evidence에 연결.

> 이 문서는 Advisor 경고에 대한 설계 판단 기록이다. 경고를 “해결됨”으로 선언하거나 production 보안 승인을 대신하지 않는다.
