# HERO Migration 022 — Player 자율 닉네임 변경 원자성

> 2026-10-08 KST · `work/actions-paused-batch-20261008`  
> **CODE READY FOR VALIDATION / pgTAP NOT RUN / STAGING NOT APPLIED**

## 정책 및 구현

`public.change_nickname_self_atomic(p_user_id uuid, p_nickname text)`는 다음을 **단일 DB 트랜잭션**으로 처리한다.

1. 서비스 역할만 실행 가능. 입력된 Player ID를 DB 활성 Player 프로필로 재검증, `FOR UPDATE` 잠금. 동시 자율 변경/담당자 강제 초기화에 동일 프로필 잠금을 사용.
2. DB 현재 open 시즌 조회; 시즌이 없으면 `no_open_season`.
3. 이름 길이 2~12자, 한글/영문/숫자, 금칙어, 유일성 DB 재검증. Edge의 사전 검사만 신뢰하지 않음.
4. 동일 닉네임이면 `changed=false`, 시즌권 및 감사 이력 소모 없음.
5. 기존 `self_change` 이력이 있으면 시즌당 1회 제한. 단 `nickname_reset_required=true`인 Manager 강제 초기화 복구는 예외로 허용.
6. 변경 시 `profiles.nickname`, `nickname_reset_required=false`, `nickname_change_events.self_change`, `audit_logs.nickname.changed` 동시 기록. 감사/이력 예외면 전체 롤백.
7. 결과가 불확실한 HTTP 5xx/응답 유실 시 Player 프로필 화면에서 새 변경을 잠그며, 최신 내 기록·프로필·닉네임 정책 조회가 전부 성공해야 잠금 해제.

구현:
- `supabase/migrations/202610080022_atomic_nickname_self_change.sql`
- `supabase/functions/nickname-action/index.ts`
- `supabase/tests/nickname_self_change_atomic.test.sql`: **37 assertions 작성, NOT RUN**
- `apps/web/src/features/profile/ProfilePage.tsx`

## 검증 항목 (모두 NOT RUN)

| 분류 | 확인 |
|---|---|
| 권한 | service_role 전용, 서비스 사용자 ID와 DB 활성 Player 매치 |
| 정책 | 동일 닉네임 no-op, 시즌 최초 변경/두 번째 거절, 강제 초기화 복구 |
| 검증 | 길이, 허용 문자, 금칙어 및 중복 닉네임 SQL 경계 |
| 원자성 | 이벤트 INSERT/감사 INSERT 각각 실패 주입 후 모든 변경 롤백 |
| 동시성 | 두 독립 DB 세션에서 1명의 Player가 다른 닉네임으로 동시 변경 |
| 화면 | HTTP 응답 단절·서버 5xx 후 자동 중복 시도 방지와 재조회 |
| 랭킹 | 닉네임 변경/초기화에 따른 현재 공개 리더보드 표시명 자동 갱신 |
| 타입검사 | Edge Deno check, Web strict TS, 웹 빌드와 브라우저 E2E |

## 총 검증 수와 배포 게이트

Migration 016 43 + 017 21 + 018 27 + 019 27 + 020 30 + 021 33 + 022 37 = **신규 pgTAP 218개 작성**. 모두 실행 전이며 통과를 주장할 수 없다.

DB Migration016→017→018→019→020→021→022를 격리 환경에서 검증 후, 별도 승인하에 staging에 순서대로 적용. **닉네임 RPC 2종의 권한과 존재가 확인되기 전에 신규 `nickname-action` Edge Function을 배포하지 않는다.** Kakao 실제 계정 검증, 기존 S03 사람 검토, 개인정보/출시 승인 게이트는 별도로 유지한다.

2026-10-08 staging DB read-only 확인: profiles reset flag, nickname_change_events, nickname_forbidden_terms, seasons 기초 스키마 일치. 새 닉네임 RPC 2종은 원격 미적용.
