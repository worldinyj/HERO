# HERO — TASKLIST P0 오프라인 통합검증 실행계획

> 작성일 2026-10-08 · 브랜치 `work/actions-paused-batch-20261008`  
> **계획/검증 증거 분리: 실제 Node·Deno·pnpm·PostgreSQL 통합 실행은 NOT RUN. GitHub Actions 일괄 재개 전까지 보류.**

## 1. 현재 기준선 (읽기 전용으로 확인)

- `docs/04_TASKLIST.md`: Release 1 MVP TASK 86개. 관리용 코드 구현 진도 **75.6%** (구현 52/부분 26/미착수 8). **이 수치는 DoD·출시 준비율이 아님**.
- `ops/tasklist-progress.json`, `docs/30_TASKLIST_PROGRESS_AUDIT.md`는 모든 작업 ID와 검토 근거 파일을 나열한다.
- 2026-10-08 Supabase staging 마이그레이션 목록: **001~015**; 신규 016~024 **미적용**.
- 읽기 전용 SQL: `create_plant_atomic`·`set_plant_active_atomic` 미존재, 발전소 초대 세대 컬럼 미존재, 기존 `plants_admin_write` 정책 존재. 이는 새 배치 코드가 staging DB에 아직 반영되지 않았다는 뜻이다.
- Edge의 기존 함수들이 ACTIVE로 나열되는 것과 **현재 배치 코드가 배포되었다는 것은 전혀 다르다**.
- 신규 pgTAP **295개 선언** + 기존 SQL 테스트는 16파일. 최신 코드 일괄 pgTAP/E2E **NOT RUN**. RELEASE BLOCKED.

### 세션 Edge 조회 오류 구분 추가 회귀 게이트

- `start-session`/ `submit-session`은 DB 오류·비정상 응답을 500으로, 정상 조회 후 데이터 미존재만 기존 404/409로 반환한다. `lookupOutcome.ts`, `lookupOutcome.test.ts`(Deno 3그룹), `docs/32_SESSION_LOOKUP_ERROR_VALIDATION.md` 참조.
- 기존 TASKLIST 75.6%는 코드 산출물 진행률이며, 이 개선으로 실제 CI·DB pgTAP·E2E를 완료했다고 판정하지 않는다.

## 2. P0 검증 순서와 즉시 중단 조건

### 2.1 네트워크 없이 실행하는 정적 검사

```bash
node scripts/check-tasklist-progress.mjs
node scripts/check-batch-db-contracts.mjs
```

둘 중 하나라도 실패하면 DB 적용 준비 중단. 첫 명령은 86개 ID·근거 파일·상태를 검사하고, 둘째는 016~024 SQL 9개·8 privileged RPC·pgTAP 선언·DB/Edge/UI 정적 계약을 검사한다. 정적 PASS는 PostgreSQL PASS가 아니다.

### 2.2 로컬 소스 품질 게이트

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm validate:scenario
pnpm check:source-evidence
pnpm check:cause-traceability
pnpm check:human-review-evidence
pnpm check:mvp-readiness
```

- 모든 명령은 **프로젝트 복제본 로컬**에서 실행. PR/push/Actions는 사용하지 않음.
- 의존성 설치/TS/Deno/웹 테스트가 하나라도 실패하면 다음 단계 진입 금지. 수정사항은 배치 브랜치에만 커밋.
- `check:mvp-readiness`는 개발상 보고 모드이며 사람 승인·RC 출시 차단을 우회하지 않는다.

### 2.3 Deno Edge 격리 검증

- `supabase/functions/deno.json`을 사용하는 Edge 테스트 및 `_shared` 테스트 전체를 실행. 특히 URL·RPC 결과 영속성·초대 오류·UUID·JSON 타입을 검증.
- Edge 함수별 Deno check 및 사용자 역할 (Admin·Manager·Player·초대 미사용자) 거절 경로를 시험. **실제 staging의 서비스 역할 키를 테스트에 재사용하지 않음**.

### 2.4 격리 PostgreSQL 및 pgTAP

- **새 빈 로컬 Supabase/PostgreSQL 격리 환경**을 준비한 뒤 Migration 001~024를 정확히 적용한다. `supabase test db`로 전체 SQL 16파일을 실행한다.
- Migration024의 기존 비활성 발전소 초대 세대 초기 보정은 **023 적용 후, 024 적용 전** fixture가 있어야 검사 가능. 별도 migration 업그레이드 재현 사례로 수행한다.
- `pgTAP 295`는 새 검사 선언 **개수**이다. 결과가 PASS인지, 테스트 런 수가 일치하는지는 실제 로그로 확인.
- 두 DB 연결을 이용해 취소↔재발급↔수락, 동일 Player 상태·닉네임 변경, 발전소 중지↔세션 시작/제출, 감사 INSERT 실패 시 롤백을 검증.
- **운영/staging DB에 SQL 쓰기·migrate 적용 금지**. 현재 접속/CLI 권한으로 테스트 환경을 만들 수 없으면 `NOT RUN` 유지.

### 2.5 모바일·접근성·운영 검증

- `pnpm e2e`: Playwright 모바일 두 뷰포트(360×800, 390×844)와 초대, 플레이, 오프라인 큐, replay, 결과·리더보드, 발전소 중지·재활성화 회귀 확인.
- 실제 Kakao 3계정·Android/iOS/Samsung Internet·사내망/개인폰·개인정보/법무는 별도 사용자/담당 승인 후 시험.
- S03 HF/익명화 사람 검토, S01/S02 원문·이용조건 확인, 오디오 `included/excluded` 결정, 30명 파일럿 선행 없이 v1.0 승인 불가.

## 3. Staging 적용 (검증 + 사용자 승인 뒤에만)

`016 → 017 → 018 → 019 → 020 → 021 → 022 → 023 → 024` 순으로 migration. 그 뒤 신규 RPC 8종 GRANT/RLS, 기존 Edge 호환성, 웹 배포 SHA 일치를 확인한다. **새 Admin UI만 먼저 배포하거나 새 Edge만 먼저 배포하지 않는다.** 실제 Kakao E2E, Staging Smoke, RC Gate는 같은 승인된 SHA로 최종 수행한다.

현재 단계에서는 이 순서를 **문서화만** 했으며, DB migration·Edge 배포·Cloudflare Pages·GitHub Actions·PR·main에는 손대지 않았다.
