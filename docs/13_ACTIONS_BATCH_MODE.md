# HERO Actions 절약 모드 — 배치 검증 운영 규칙

> 운영 결정: 2026-10-08 KST — 사용자가 GitHub Actions 사용량 제한 가능성을 고려해 일시적인 실행 최소화와 **나중에 일괄 검증**을 요청함  
> 범위: HERO 개발 저장소. 영구적인 CI 폐지가 아님.  
> 상태: **BATCH-DEVELOPMENT / CI NOT VERIFIED / RELEASE BLOCKED**

## 1. 자동 실행을 피하는 방법

현행 CI, Database Policy Tests, E2E는 각각 `push(main)` 및 `pull_request` 이벤트로 실행된다. Release Candidate Gate와 Staging Smoke는 `workflow_dispatch` 수동 실행이다.

- 작업 브랜치: `work/actions-paused-batch-20261008`
- 기준: Draft PR #79의 `050e1aaa73190d3603949c41aa882040d3347fdd`에서 분기한 **PR 없는 개발 브랜치**
- Actions 절약 기간에는 **`main`에 푸시/병합 금지**, **PR #79 브랜치 업데이트 금지**, **새 PR 생성 금지**, **실패한 Actions 재실행 금지**.
- 브랜치에만 여러 커밋을 누적하면 현재 이벤트 설정에서는 자동 GitHub Actions가 시작되지 않는다. 단, 외부 설정·워크플로 규칙이 바뀌면 재확인이 필요하다.
- 다른 협업자가 PR을 새로 열거나 `main`에 푸시하는 것은 별도 트리거이므로 저장소 단위 전면 중지와 동일하지 않다.
- Actions Workflow 파일 자체를 비활성화하거나 삭제하지 않는다. 나중에 같은 검사로 검증하기 위해 그대로 보존한다.

## 2. 이 기간에 가능한 일

- 시나리오 조사, 원인-근거-방어막 추적성 및 사람 검토자료 정리
- 앱·마이그레이션·RLS·pgTAP 테스트 코드 개선
- 로컬 개발 환경에서 가능한 정적 검사, 테스트, 타입검사, 빌드
- 사람 승인 미완료 사실을 유지한 채 S03 검토 요청자료 보완

**원격 Supabase 스키마 변경, 외부 배포, 경쟁 시나리오 승인 및 릴리스 증거를 자동으로 성공 처리하지 않는다.**

## 3. 누적 변경사항

- PR #79: 리더보드 projection Migration 016의 활성 Player 순위 집계·시즌 재귀속 양쪽 갱신 보완 및 라이프사이클 pgTAP 23개
- 발전소명 충돌 대응: 진행 중·종료 시즌 projection에 `plant_id`를 포함하고 UI의 ‘우리 발전소’ 필터를 UUID 기준으로 변경. 표시명 변경 시 현재 projection 갱신 트리거 추가, 동일 표시명/변경/시즌종료 pgTAP 12개 추가
- 일괄 개발 브랜치: `my_record_summary()`의 없는 시즌 컬럼 참조 수정, 실제 현재(open) 시즌으로 판정, 사용자 격리 pgTAP 8개
- 사람 검토자료: S01·S03 관련 원인·방어막 정보의 시나리오 간 혼재 수정
- CSV 대량 초대: 성공 링크 부분 저장/중단 후 이어하기/1회 25건 제한, `SITE_URL` 입력 오류 사전 차단. 네트워크 중단·5xx·응답 불확실 시 **자동 재개 금지 및 미수락 초대 확인 후 새 목록 시작**
- 초대 가입: 닉네임 중복확인 응답의 입력값 변경 레이스 방지
- 실제 Kakao 계정 검증 계획: `docs/14_KAKAO_LIVE_INVITE_VALIDATION.md` (시험 전 상태 `NOT RUN`)
- 카카오 OAuth/로컬 E2E `next=` 복귀 주소를 단일 `safeAppReturnPath` 함수로 검증: 외부 URL, `//`, 역슬래시, 제어문자 및 위험한 percent-encoded 경로를 차단. 격리된 Node 테스트 21사례 및 TypeScript 단독 검사 통과 (**전체 Vitest/CI 미실행**).
- Admin→발전소 담당자 발급·재발급: 응답 불확실 시 재요청 차단, 기존 일회용 URL 표시 유지, 다른 초대 취소 시 현재 URL 보호. `manager-user-action`은 `SITE_URL` 검사 후에만 기존 초대 취소.
- Migration 017 코드 추가: `reissue_invitation_atomic`(service_role-only)으로 기존 초대 잠금·취소, 새 초대 발급, 감사 로그 두 건을 하나의 DB 트랜잭션에 통합. pgTAP 21개 작성. **실제 DB 실행·동시성 확인 전이며 원격 미적용**.
- Migration 018 코드 추가: `cancel_invitation_atomic`으로 초대 행을 잠그고 취소와 감사 1건을 동일 트랜잭션에 반영. pgTAP 27개 작성. **미실행·원격 미적용**.
- 발전소담당자 Dashboard의 재발급 응답 불확실성·일회용 링크 자동 소실도 보완 (UI 실제 E2E NOT RUN).
- 검증 문서: `docs/17_ATOMIC_INVITATION_REISSUE_VALIDATION.md`, `docs/18_ATOMIC_INVITATION_CANCEL_VALIDATION.md`. Migration 016 43 + 017 21 + 018 27 = **91개 pgTAP assertion 코드 작성, NOT RUN**.
- 사용자 요청에 따라 Actions를 반복 호출하지 않음

## 4. Actions 없이 로컬에서 선택적으로 실행할 검사

작업 환경에 Node/pnpm 및 필요한 의존성이 설치되어 있을 때만 실행한다.

```bash
pnpm install --no-frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm validate:scenario
pnpm check:source-evidence
pnpm check:cause-traceability
pnpm check:scenario-promotion
pnpm check:human-review-evidence
pnpm build:review-packet -- --scenario=s03_procedure_reality_gap --check
pnpm check:mvp-readiness
# GitHub Actions를 실행하지 않고 로컬에서 초대 도구 단위 테스트
pnpm --dir apps/web test
# Deno가 설치된 경우에만 순수 URL 검증 테스트
deno test supabase/functions/_shared/inviteUrl.test.ts
```

로컬 Docker와 Supabase CLI가 있을 때만 pgTAP 정책 테스트:

```bash
supabase db start
supabase test db
supabase stop --no-backup
```

검사를 실행하지 못했다면 **NOT RUN**으로 기록한다. 정적 검사 결과를 pgTAP/E2E PASS로 표시하지 않는다.

## 5. Actions 사용 재개 시 일괄 절차

1. 사용량/결제/Runner 차단의 상태를 GitHub UI에서 확인한다.
2. 배치 브랜치를 최종 확인하고 기존 Draft PR #79와의 중복을 정리한다. 단일 통합 PR에 누적 변경사항을 제출한다.
3. Actions가 정상 실행될 수 있을 때 **최종 PR SHA**에서 CI, Database Policy Tests, E2E를 실행한다. 중간 커밋마다 실행·재시도하지 않는다.
4. 테스트 실패 시 로그를 확보해 같은 배치 브랜치에서 수정한다. 코드 성공과 Runner 실행 실패를 구분한다.
5. 모두 PASS한 뒤 승인에 따라 `main`에 병합하고 병합 SHA에서 검증한다.
6. 로컬 pgTAP 전체 성공 및 승인 후, staging에 migration 016 → 017 → 018 순서대로 적용하고 Edge Function `manager-user-action`과 관련 웹 버전을 호환되게 배포 → 실제 보안 검사(Security Advisor, RLS 정책) → Kakao Admin→Manager→Player 초대 검증 → S03 사람 검토 및 staging smoke.
7. S01/S02 SOURCE_HOLD, S03 HUMAN_REVIEW_PENDING, 약관/개인정보/실기기/파일럿 등 출시 차단 게이트는 각각 별도 증거로만 해제한다.

## 6. 참조

- [CI 실행 차단 추적: Issue #78](https://github.com/worldinyj/HERO/issues/78)
- [기존 Draft PR #79](https://github.com/worldinyj/HERO/pull/79)
- `docs/10_MVP_READINESS.md`
- `ops/release-evidence.json`
