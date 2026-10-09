# HERO — 교육 세션 제출 JSON/행동 이력 입력 검증

> 기준 2026-10-08 · 브랜치 `work/actions-paused-batch-20261008`  
> **CODE IMPLEMENTED / Deno FULL TEST NOT RUN / DB & STAGING UNCHANGED**

## 배경

`submit-session`의 기존 RequestBody 타입 단언은 런타임 JSON을 검사하지 못했다. null/원시형 행동 요소와 숫자형 actionId 등이 `act()`의 실행 경로까지 들어갈 수 있었으며, 엔진의 예외 메시지가 `action_log_rejected.detail`에 그대로 표시됐다. 이는 클라이언트가 확실히 거절해야 할 malformed 요청을 예상 불가능한 오류와 혼동시키는 원인이었다.

## 변경

- `supabase/functions/_shared/submissionInput.ts`: 읽기 전용 JSON 객체 검증 후 행동 로그 4종(`continue`, `choice`, `info`, `card`)을 판정. 필요한 `actionId` 또는 `cardId`는 비어 있지 않은 최대 256자 문자열이어야 한다. 타입 불일치·서로 다른 타입의 필드 동시 제시·251개 이상 행동을 거절한다. 명시적 `actions:null`은 거절하고, 필드 미제공 시만 구형 클라이언트 호환으로 빈 배열 취급.
- `reflectionAnswered`, `swissCheeseViewed`가 제시된 경우 boolean만 허용. 필드 미제공은 false로 명시.
- `supabase/functions/submit-session/index.ts`는 입력 사전검증 후 UUID 검증 및 순서대로 `act()`에 전달. 잘못된 입력은 **HTTP 400 `invalid_submission`**. 실제 엔진 실행 중의 잘못된 경로는 **HTTP 409 `action_log_rejected`**만 반환하고 시나리오 내부 상세 메시지를 HTTP에 실어 보내지 않는다.
- `supabase/functions/_shared/submissionInput.test.ts`: 유효한 행동 순서 유지, malformed JSON/요소, 250/251개 경계, 플래그 타입/누락 호환성 등 4개 Deno 테스트 그룹.
- `.github/workflows/ci.yml`에 테스트 1단계를 **장래 일괄 CI 실행용으로 등록**. GitHub Actions는 수행하지 않음.

## 검증 대기

| ID | 시험 | 기대 | 상태 |
|---|---|---|---|
| SUB-01 | 4종 정당한 행동 로그 제출 | 순서/ID 변형 없이 재실행 | NOT RUN |
| SUB-02 | null/숫자/문자열/배열 요소 및 잘못된 ID | DB/엔진 호출 전 400 | NOT RUN |
| SUB-03 | 행동 목록 정확히 250건 / 251건 | 허용 / 400 | NOT RUN |
| SUB-04 | `actions:null` / 목록 필드 생략 | 400 / 하위호환 빈 목록 | NOT RUN |
| SUB-05 | reflection/swissCheeseViewed 숫자 또는 문자열 | 400, 미제공은 false | NOT RUN |
| SUB-06 | 잘못된 게임 내 결정 또는 보관된 선택 이력 변조 | 409, 내부 예외 상세 미노출 | NOT RUN |
| SUB-07 | 정상 완료 및 경쟁 제출, 오프라인 큐 재전송 | 결과·이력·점수 원자성 보존 | NOT RUN |
| SUB-08 | 정지된 발전소의 기존 교육 세션 제출 | 403 plant_inactive, 자동 복구 정책 유지 | NOT RUN |

## 완료 조건

`deno test --config supabase/functions/deno.json supabase/functions/_shared/submissionInput.test.ts` 및 `deno check --config supabase/functions/submit-session/deno.json supabase/functions/submit-session/index.ts` 통과, 웹의 offline submit queue Vitest/E2E, 격리 DB pgTAP 및 동일 세션 동시 완료 테스트 통과. **개별 소스 작성만으로 Tasklist T5-03을 DoD 완료 처리하지 않는다.**

배포 시에는 migration 016~024의 전제 검증/승인과 Edge 함수 버전을 한 번에 대조해야 한다. 사용자 요청에 따라 현재 `main`, PR #79, 원격 Supabase, Cloudflare, GitHub Actions에 변경을 가하지 않는다.
