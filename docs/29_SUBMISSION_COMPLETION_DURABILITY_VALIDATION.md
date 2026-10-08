# HERO — 교육 제출 영속성 및 중지 발전소 복구 검증

> 2026-10-08 · `work/actions-paused-batch-20261008`
> **CODE COMMITTED / DENO·VITEST·POSTGRESQL NOT RUN / STAGING UNCHANGED**

## 원인과 수정

발전소 중지 시 `submit-session`은 403 `plant_inactive`를 반환한다. 종전 오프라인 제출 큐는 모든 403을 영구 실패로 분류하여 대기 기록을 차단했다. 또한 잘못된 HTTP 2xx를 성공으로 간주하여 로컬 행동 로그를 삭제할 가능성이 있었다.

- `submissionQueue.ts`: 실제 HTTP 403 + `plant_inactive`일 때만 제출 pending 유지. 다른 403은 기존 권한 거절 정책을 유지한다. HTTP 2xx의 세션 ID·완료 여부·저장 평가 구조를 검증하고 불일치 시 `submission_result_unknown`으로 처리한다.
- `submissionReceipt.ts`: HTTP 오류 원문의 `Response.clone()`에서 정확한 코드만 읽어 내고, 완료 응답의 `sessionId`, `alreadyCompleted`, `evaluation.ending`, 유한한 `hpPoint`를 검증한다.
- `CompetitiveGamePage.tsx`: 대기↔전송 상태 변화로 자동 루프가 발생하지 않도록 온라인 재연결에만 화면 재시도. 중지된 발전소 안내, 대기 저장소 오류와 수동 재시도, 로컬 캐시 정리 실패와 이미 확인된 서버 완료 상태 분리.
- `submit-session/index.ts` + `completionReceipt.ts`: DB `complete_play_session_atomic`의 원본 완료 응답을 검증. 동시 제출 시 이미 저장된 평가를 우선 반환하고 불명확한 RPC 응답은 완료로 주장하지 않는다.
- `submissionQueue.test.ts`, `submissionReceipt.test.ts`, `completionReceipt.test.ts`: 회귀 테스트 작성. 향후 배치 CI Deno 테스트 항목 등록(이번에는 실행하지 않음).

## 아직 수행하지 않은 검증

| ID | 상황 | 기대 |
|---|---|---|
| SUB-01 | 정상 제출 또는 이미 완료된 세션의 재전송 | 확인된 DB 평가로 성공 처리 |
| SUB-02 | HTTP 2xx null·다른 세션 ID·손상된 평가 | 완료 아님, 로컬 제출 대기 유지 |
| SUB-03 | 중지 발전소의 정확한 403 `plant_inactive` | 영구 차단 대신 pending 보존 |
| SUB-04 | 다른 원인의 403·400·409 | 자동 재시도 금지 |
| SUB-05 | queued→submitting→queued 반복 | 재연결 없이 서버 반복 요청 없음 |
| SUB-06 | 브라우저 저장소 비활성화 | 제출 보관 성공 문구 사용 금지 |
| SUB-07 | 동시 완료 트랜잭션 경합 | DB에 실제 저장된 평가만 반환 |
| SUB-08 | 완료 후 로컬 캐시 삭제 실패 | 이미 확정된 완료 상태는 유지 |

## 배포 전 필수 순서

1. `pnpm --dir apps/web typecheck`, `pnpm --dir apps/web test`, `deno test --config supabase/functions/deno.json supabase/functions/_shared/completionReceipt.test.ts` 실행.
2. 격리 PostgreSQL Migration001~024·pgTAP **291개 선언분** 실행 및 Submit/Deactivate 동시 트랜잭션을 별도로 검사.
3. 브라우저 오프라인·재연결·IndexedDB 접근 불가·HTTP 응답 손상·403 일시중지 E2E.
4. 사용자 승인 이후에만 DB016~024, Edge, 웹을 호환 버전으로 배포.

**GitHub Actions 실행, main, PR #79, 원격 Supabase, Cloudflare staging 미변경.**
