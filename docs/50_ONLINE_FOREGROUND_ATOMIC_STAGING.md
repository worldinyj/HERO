# HERO — 최초 온라인 전송의 원자적 제출 기록 저장

2026-10-08 · T5-04 PARTIAL · work/actions-paused-batch-20261008

## 결함
이전 구현은 온라인 최초 제출 시 대기 기록이 없으면 곧바로 `submit-session`을 호출했다. 따라서 응답이 유실되거나 탭이 종료될 경우 사용자가 선택한 행동의 사본을 보존하지 못할 수 있었다.

## 변경
- `submissionForegroundStagePolicy.ts`: 현재 DB 행의 소유자·시나리오·행동 본문 일치 여부와 committed/blocked 상태를 구분한다.
- `submissionQueue.stageForegroundSubmission`: readwrite 트랜잭션 내 `get→정책 판단→put`으로 최초 `pending`을 만들고, 트랜잭션이 성공한 후에만 네트워크 호출을 시작한다.
- 온라인 신규 제출, 기존 pending 재제출 모두 DB에서 확인한 원본 `body`를 보낸다. 마커 저장 전 서버 전송을 금지하고, 인증 사용자가 변경되면 네트워크를 차단한다.
- 서버 완료 시 pending→committed 영수증→로컬 정리, 일시 오류 시 pending 유지, 영구 거절 시 blocked 보호.

## 검증
- 순수 정책 테스트 8건 작성.
- 제출 큐 IndexedDB mock 통합 시험 8건 추가. 기존 시험의 '완료 후 마커 쓰기 실패'와 '전송 전 최초 기록 쓰기 실패'를 구별하기 위해 `failQueuePutAt` 카운터 도입.
- 실제 Vitest/IndexedDB 브라우저 멀티탭/PostgreSQL 동시성 E2E 시험은 아직 NOT RUN. 해당 기능은 T5-04 PARTIAL.
- GitHub Actions, main, PR #79, 원격 Supabase, Cloudflare 미변경. Tasklist 진도율 75.6% 유지.

## 기록 쓰기 실패 시점 분리 (2026-10-08)

기존 pending 행이 있는 경우는 신규 스테이징 put이 없으므로 **영수증 마커 쓰기가 첫 번째 put**이다. 기존 회귀 2건의 오류 주입 인덱스를 1로 수정했다. 신규 온라인 최초 제출은 1번째 put이 pending 생성, 2번째 put이 committed 영수증이므로 **두 번째 put만 실패시키는 회귀 1건**을 추가했다. 이때 서버 결과는 submitted/cleanupPending으로 알리되, 원본 pending을 삭제하지 않도록 확인한다. 실제 Vitest 실행은 미완료.
