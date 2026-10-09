# HERO — 세션 Edge 조회 오류와 확정적 부재 구분 검증

> 2026-10-08 KST · `work/actions-paused-batch-20261008`  
> **CODE COMMITTED / NO STAGING DEPLOY / DENO & E2E NOT RUN**

## 배경 및 변경

기존 `start-session`과 `submit-session`은 DB 오류가 발생했을 때에도 HTTP `404 session_not_found`, `409 no_open_season`, `409 scenario_not_enabled_for_season` 등으로 응답하는 경로가 있었다. 이는 장애를 실제 데이터 부재처럼 보이게 하고 사용자나 오프라인 제출 큐에 불필요한 확정 거절을 남길 수 있다.

- `supabase/functions/_shared/lookupOutcome.ts`: **단건 조회** = `failed / missing / found`, **목록 조회** = `failed / empty / found`. 에러 객체가 있거나 정상 DTO 형태가 아니면 `failed`다.
- `start-session`: 시즌, 경쟁 시나리오, 시즌 바인딩, 시나리오 버전, 기존 세션, 리플레이 원본·결정 지점 조회의 transport/DB 오류를 내부 `500`으로 구분한다. 정상 조회 후 데이터가 없을 때에만 업무상 404/409를 반환한다. 기존 세션 조회 실패 시 새 INSERT 시도를 차단한다.
- `submit-session`: 대상 세션, 저장된 시나리오 버전 조회 오류를 확정적 404가 아닌 500으로 분리한다. 오프라인 제출 큐는 정상 데이터 없음을 명확히 구분할 수 있다.
- `lookupOutcome.test.ts`: 단건 조회, 비정상 DTO, 목록 조회의 **3개 Deno 테스트 그룹** 추가. `.github/workflows/ci.yml`에 **향후 일괄 CI 전용** 명령 등록(현 브랜치 실행하지 않음).

## 검증 시나리오

| ID | 상황 | 기대 응답 | 상태 |
|---|---|---|---|
| SL-01 | season 조회 DB 연결 실패 | 500 `internal_error`, 409 오판 없음 | NOT RUN |
| SL-02 | season 조회 정상 결과 null | 409 `no_open_season` | NOT RUN |
| SL-03 | 시즌 바인딩 결과 null/객체 또는 DB 오류 | 500, 활성화되지 않았다고 오판 없음 | NOT RUN |
| SL-04 | 시즌 바인딩 정상 빈 배열 | 409 `scenario_not_enabled_for_season` | NOT RUN |
| SL-05 | 기존 in_progress 세션 조회 실패 | 새 세션 삽입 금지, 500 | NOT RUN |
| SL-06 | replay source/target 조회 장애 | 500, 잘못된 replay라 오판 금지 | NOT RUN |
| SL-07 | 제출 session 조회 DB 장애 | 500, 제출 큐 데이터 보존/재시도 | NOT RUN |
| SL-08 | 제출 session 조회 정상 null | 404 `session_not_found` | NOT RUN |
| SL-09 | 저장된 version 조회 장애 | 500, 404 오판 없음 | NOT RUN |
| SL-10 | 실제 Deno 테스트/타입검사/두 연결 세션 충돌/E2E | 모든 요구조건 충족 | NOT RUN |

## 배포·QA 게이트

1. 로컬에서 `deno test --config supabase/functions/deno.json supabase/functions/_shared/lookupOutcome.test.ts` 실행.
2. `deno check`로 두 Edge Function의 TypeScript 타입 정확성 확인. 특히 lookup 분기 후 non-null narrowing 확인.
3. DB 장애 주입 테스트는 **격리 환경**에서 실시. 실제 staging/운영 접속을 끊거나 데이터/키를 변조하지 않는다.
4. 사용자 승인 및 016~024 Migration 적용/호환 배포 완료 이후에만 실제 Kakao Player·모바일 제출 큐·네트워크 중단 E2E 검증.
5. 기존 TASKLIST 진행률 75.6%는 코드 산출물 기반 수치이며 이번 오류 분리로 별도의 Task ID가 최종 DoD 완료되는 것은 아니다.

**GitHub Actions, main, PR, Supabase remote DB, Cloudflare staging은 변경하지 않는다.**
