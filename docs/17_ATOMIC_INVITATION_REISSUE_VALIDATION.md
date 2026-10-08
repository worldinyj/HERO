# HERO Migration 017: 원자적 초대 재발급 검증 게이트

> 2026-10-08 · 배치 브랜치 `work/actions-paused-batch-20261008`  
> **NOT RUN — 로컬 DB, Supabase Staging, 실제 카카오 계정에는 어떤 변경도 적용하지 않았음.**

## 설계 계약

Edge `manager-user-action`의 `reissue-invite`는 SITE_URL·발전소 표시명 조회와 토큰 생성/해시를 마친 후 **한 번의 service_role RPC**만 호출한다.

`public.reissue_invitation_atomic(p_invitation_id, p_actor_user_id, p_token_hash, p_expires_at)`가 같은 트랜잭션에서 수행한다.

1. 서비스에서 전달한 SHA-256 hex와 만료시각 검증
2. 실 DB 프로필 기준 actor가 활성 `admin` 또는 `plant_manager`인지 검증
3. 초대 행 `FOR UPDATE` 잠금; 이미 수락/취소된 토큰은 거절
4. Admin은 담당자 초대만, Manager는 자신의 발전소 Player 초대만 변경 허용
5. 원본 `canceled_at` 설정 + 새 토큰 hash INSERT + 감사 두 건 동시 저장
6. 유일성 위반·감사 실패 등 중간 예외가 발생하면 원본 취소도 전부 롤백

권한: `PUBLIC`, `anon`, `authenticated`에서 실행권한을 명시적으로 제거; `service_role`만 `EXECUTE`. `SECURITY DEFINER SET search_path = ''`이며 모든 테이블은 정규화된 `public.` 스키마로 접근한다. 브라우저에 service_role 키를 전달하면 안 된다.

## 실제 배치 검증 (전체 NOT RUN)

| 검사 | 방법 | 상태 |
|---|---|---|
| DB 함수 생성 및 호출 타입 | Migration016 → Migration017 로컬 순서 적용 | NOT RUN |
| RBAC/권한 | `supabase/tests/invitation_atomic_reissue.test.sql` | NOT RUN |
| 취소·생성·감사 일괄 성공 | 위 테스트, 원본 토큰 비활성 확인 | NOT RUN |
| 유일한 token_hash 충돌 실패 주입 | SQLSTATE 23505 + 원본 `canceled_at IS NULL` | NOT RUN |
| 관리자와 타 발전소 담당자 격리 | 직접 RPC 우회/경계 테스트 | NOT RUN |
| 동일 초대 동시 재발급 요청 | 격리 DB의 병렬 트랜잭션 2개로 잠금/성공 1건 확인 | NOT RUN |
| DB 트랜잭션 후 HTTP 응답 단절 | UI의 결과 불확실/재시도 차단 확인 | NOT RUN |
| 실제 Admin→Manager→Player 재발급 | 승인된 staging Kakao E2E | NOT RUN |
| 코드 검사 | `deno check --config supabase/functions/deno.json supabase/functions/manager-user-action/index.ts` | NOT RUN |

추가된 pgTAP assertion은 **21개**, 기존 016 관련 43개와 합쳐 **64개 코드로 작성**. 64개가 실행 통과한 뜻은 아니다.

## 적용 순서 / 금지사항

1. 사용자가 승인한 Actions 사용 재개 시점에 PR 최종 SHA 기준으로 CI 및 Database Policy Tests를 1회 실행.
2. 로컬 DB 검증에서 permission, 23505 rollback, 감사 기록 개수, 동시성을 확인.
3. 별도 배포 승인과 스키마 백업/롤백 계획을 세운 다음 **Migration016 → Migration017 → Migration018** 순서로 staging 적용.
4. 새 `reissue_invitation_atomic`과 `cancel_invitation_atomic`이 모두 존재하고 execute grant/service key 설정이 맞는지 확인 후, Edge `manager-user-action` 배포.
5. 신구 함수 버전이 섞이는 구간을 피하고 Kakao 재발급 E2E를 수행.
6. 모든 체크가 PASS일 때만 prod/main 승인을 검토. S03 scenario의 사람 검토는 별개 게이트.

Supabase DB를 읽기 전용으로 확인한 결과(2026-10-08): 기존 `public.invitations`, `public.audit_logs`의 필요한 컬럼과 `service_role`이 존재하며 **새 함수는 아직 없음**.
