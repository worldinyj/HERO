# HERO MVP Release Readiness

| 항목 | 상태 |
|---|---|
| 기준일 | 2026-10-07 |
| 코드 기준선 | `main` |
| 대상 | MVP Release 1 |
| 현재 판정 | **프로덕션 RELEASE BLOCKED / 내부 개발·통합 준비 완료에 가까움** |
| 자동 확인 | `pnpm check:mvp-readiness` |
| 사람 승인 증거 | `ops/release-evidence.json` / `pnpm check:release-evidence` |
| 출시 강제 게이트 | `pnpm check:legal-release -- --strict
pnpm check:mvp-readiness -- --strict` + GitHub **Release Candidate Gate** |

## 1. 판정 원칙

HERO는 **코드가 빌드된 것**과 **프로덕션에 공개해도 되는 것**을 구분한다.

자동 CI가 통과해도 다음 조건이 남아 있으면 Release 1을 공개하지 않는다.

- 경쟁 시나리오 3종의 source/rights/HF/익명화/사람 승인
- 이용약관·개인정보 처리방침 실제 운영정보 확정 및 담당부서 검토
- Supabase/Cloudflare/Kakao 실제 프로젝트·도메인 구성
- 실기기/사내망 접근성 확인
- 파일럿 운영
- 승인된 오디오를 MVP에 포함하기로 결정한 경우 오디오 HF·권리·기술 QC

## 2. 현재 준비 상태

| 영역 | 상태 | 현재 근거 / 다음 조건 |
|---|---|---|
| 모노레포·React/Vite·CI | **READY** | lint, typecheck, unit test, build 자동화 |
| 게임 엔진·점수·seed 분리 | **READY** | 서버 재실행, path simulator, HP balance guard |
| 인증·초대·역할·RLS | **READY (코드)** | 역할 매트릭스 pgTAP, 1회용 초대, 최초 admin bootstrap, 초대 없는 신규 Auth 세션 자동 로그아웃/재안내 |
| 감사로그·rate limit·secret guard | **READY** | append-only audit, service-role limiter, client-secret CI |
| 튜토리얼·경쟁 플레이·리플레이 | **READY (코드+E2E)** | server session, offline persistence/queue, replay lineage + 모바일 리플레이 오프라인 제출/재접속 E2E PASS |
| PWA·오프라인 셸 | **READY** | manifest, service worker, install shell, CI 검증 |
| 리더보드·월간 시즌 | **READY (코드)** | pagination, KST rollover test, snapshot, self rank |
| 담당자 프라이버시 | **READY (코드)** | 개인 점수/선택 차단, n<5 억제, 닉네임↔HP 역조회 차단 |
| 접근성 | **READY (자동 게이트)** | WCAG 2.2 AA 자동 검사, reduced motion, 키보드/포커스 |
| 모바일 핵심 E2E | **READY (자동 게이트)** | 360×800/390×844: 초대→가입→플레이→결과→리플레이→오프라인 제출 큐→재접속 자동제출→리더보드 자동 플로우 |
| S00 튜토리얼 | **APPROVED** | competitive source gate 예외 |
| S01 | **SOURCE_HOLD (v2)** | IAEA 직접 사건기록 기준 Direct Cause/물리 인과사슬(시험 중 인적오류→LOOP, 비상전원 가용성 문제→SBO/정지냉각 상실)과 HF 근본·기여조건을 분리. OPIS/NSIC 사건별 direct URL/식별번호/PDF, 2012 KHNP 개별 이용표시, HF/익명화 승인 남음 |
| S02 | **SOURCE_HOLD (v2)** | 확보된 원안위 보도자료 전재 기준 Direct Cause/물리 인과사슬(잘못된 회로상태 + 조작부 오인→터빈·발전기 정지→원자로 정지)과 HERO 방어막 분석을 분리하고, 원문이 명시한 회로정비·인적오류 방지 설비개선만 corrective action으로 반영. 정책브리핑/원안위 직접 상세와 개별 이용표시, OPIS/NSIC 사건별 상세 레코드, HF/익명화 승인 남음 |
| S03 | **REVIEW_READY (v4)** | KINS 상세보고서 기반 Direct/Root/Contributing + 인과사슬·방어막·재발방지대책 추적성 및 공개정보 일반화 완료. v4에서 미예정·비필수 설정 변경을 필수 절차단계처럼 보이게 하던 게임 전제를 수정하고 조작 필요성 재확인 safe-stop 경로를 추가. HF·운전맥락·익명화·incidentDebrief 사람 승인 남음 |
| 약관·개인정보 | **BLOCKED** | `[확정 필요]` 제거 + `release-evidence.json`의 법무/개인정보 승인 증거 필요 |
| 외부 배포 | **CONNECTED / RELEASE BLOCKED** | Cloudflare Pages + Supabase + Kakao 실연동 및 최초 Admin bootstrap 확인. 동일 SHA Staging Smoke, 실기기·사내망·외부배포 승인 증거는 남음 |
| 오디오 런타임 | **READY (코드)** | AudioManager, 최초 소리/무음 선택, BGM crossfade·dialogue ducking, SFX voice limit, 독립 mute/volume, reduced-sensory, lazy-load/cache, manifest CI gate 구현 |
| 오디오 자산 | **DEFERRED** | `audioPolicy=deferred`. RC 전에 `excluded` 또는 `included`를 명시 결정. included면 승인 asset + audioQc 증거 필요 |
| 실기기·사내망 | **BLOCKED** | 4종 실기기 확인 + 사내망/개인폰 정책 승인 증거를 `release-evidence.json`에 기록하면 PASS 전환 |
| 파일럿 | **BLOCKED** | 30명 이상·Blocker 0·승인 증거를 `release-evidence.json`에 기록하면 PASS 전환 |

## 3. 자동 검증과 사람 게이트의 경계

### 자동으로 닫힌 항목

저장소 CI에서 다음을 지속 검증한다.

- 코드 lint/typecheck/test/build
- 시나리오 schema/graph/promotion guard
- source-evidence ↔ promotion-status 출처·권리 일관성 guard
- **Direct/Root/Contributing Cause ↔ 근거 ↔ Barrier ↔ Corrective Action 추적성 guard**
- S03 공개 JSON의 고유 운전정보/설정값 sanitization guard
- 사람 승인 시나리오 SHA-256 고정 및 승인 후 내용변경 감지
- S00 및 draft path simulation
- HP 파밍·리플레이 밸런스 guard
- PWA 설치 셸
- Deno Edge Function 타입검사
- audit helper 우회 금지
- DB RLS·manager privacy·rate limit pgTAP
- 모바일 핵심 E2E: 2종 모바일 뷰포트에서 초대→플레이→서버확정→결정지점 리플레이→오프라인 완료/큐잉→재접속 자동제출→리더보드 개인정보 경계
- WCAG 2.2 AA 핵심 자동점검
- 브라우저 번들 secret 노출 방지
- staging HTTP/SPA/PWA/보안헤더 validator 자체 self-test
- GitHub **Staging Smoke** workflow 구조 준비(실제 외부 값 연결 후 수동 실행)
- release evidence validator + same-commit **Release Candidate Gate**
- legal release validator: 검토문서와 실제 배포 `/terms`·`/privacy` UI의 초안 표식·필수 정책 문구 동시 검증
- audio manifest validator: approved asset 파일 존재·same-origin 경로·중복 ID·provenance 검증

### 사람이 닫아야 하는 항목

자동화가 대신 승인하지 않는다.

- 사건 사실관계와 원자력 HF 정확성
- 익명화·운전정보 과노출
- 저작물 이용조건
- 이용약관·개인정보 처리방침
- 실제 Kakao/Supabase/Cloudflare 설정
- 실제 모바일 브라우저 동작
- 사내망/개인폰 접속 정책
- 파일럿 결과
- 오디오가 실제 경보와 혼동되지 않는지에 대한 HF 검토

## 4. 시나리오 출시 게이트

승격의 단일 기준은 `scenarios/research/promotion-status.json`이다.

경쟁 시나리오가 Release 1에 포함되려면 아래가 모두 참이어야 한다.

- `status = approved`
- `sourceRightsComplete = true`
- `hfReviewComplete = true`
- `anonymizationReviewComplete = true`
- `humanReview.status = approved`
- 승인자와 승인일 기록
- 승인 시점 JSON SHA-256 기록과 현재 파일 hash 일치
- JSON이 `scenarios/data/`에 존재
- CI promotion/schema/path/balance gate PASS

현재는 S01/S02가 `source_hold`, S03이 `review_ready`이므로 **경쟁 시나리오 3종 출시 게이트는 아직 열리지 않는다.**

## 5. 외부 운영 준비 순서

1. **S03 사람 검토**를 먼저 수행해 첫 경쟁 시나리오 승인 절차를 실제로 한 번 끝낸다.
2. S01/S02의 남은 직접 원문·개별 이용조건·OPIS 레코드 식별을 확정하고 동일 사람 검토를 수행한다.
3. 개인정보 운영주체·담당부서·보유기간·처리위탁/국외이전을 확정한다.
4. staging Supabase + Cloudflare + Kakao 환경을 연결한다.
5. GitHub **Staging Smoke** workflow를 실행해 SPA deep-link·보안헤더·PWA·Supabase Auth·peek-invite Edge 배포를 확인한다.
6. 최초 admin bootstrap은 완료되었다. 이어서 관리자→담당자→사용자 실제 초대 플로우를 별도 Kakao 계정으로 검증한다.
7. 실기기/사내망 테스트를 수행한다.
8. 오디오는 런타임 코드는 이미 준비되어 있으므로, 생성된 asset에 HF·권리·기술 QC를 수행한 뒤 `approved=true`로 manifest에 등록하고 실기기 QC를 수행한다.
9. 파일럿 1개 발전소·30명 운영 후 KPI/Blocker를 검토한다.
10. 법무·외부배포·실기기·사내망·파일럿 승인 증거를 `ops/release-evidence.json`에 기록하고 오디오 정책을 `excluded` 또는 `included`로 확정한다.
11. 릴리스 대상 `main` SHA를 staging에 배포하고 **Staging Smoke**를 PASS시킨다.
12. 같은 SHA에서 **Release Candidate Gate**를 실행해 Staging Smoke run ID와 모든 증거를 검증한다.
13. RC evidence artifact를 최종 승인자료로 첨부하고 Blocker 0일 때 v1.0 프로덕션 릴리스를 승인한다.

## 6. readiness 명령

기본 모드는 현재 상태를 **보고**하고, 의도된 사람/외부 blocker 때문에 CI를 실패시키지 않는다.

```bash
pnpm check:mvp-readiness
pnpm check:mvp-readiness -- --json
pnpm check:legal-release
```

실제 Release Candidate 판정 때는 strict 모드를 사용한다.

```bash
pnpm check:mvp-readiness -- --strict
```

strict 모드는 BLOCKED 또는 DEFERRED gate가 남아 있으면 non-zero exit code를 반환한다. `audioPolicy=excluded`는 명시적인 릴리스 범위 결정이므로 오디오 자산 0건 자체로는 차단하지 않는다. `audioPolicy=deferred`는 계속 차단한다.

> 출시 전 최종 판단은 자동 스크립트가 아니라 운영·HF·법무·개인정보·파일럿 승인 기록을 포함해 사람이 수행한다.


## 7. 사람 승인 후 승격 도구

사람 검토가 완료된 경쟁 시나리오는 manifest와 파일을 수동 편집하지 않고 아래 helper를 사용한다.

```bash
# 상태 확인만 수행
pnpm promote:scenario -- --scenario=s03_procedure_reality_gap

# 실제 승인 후에만 적용
pnpm promote:scenario -- \
  --scenario=s03_procedure_reality_gap \
  --approved-by="검토자 성명 또는 공식 역할" \
  --approved-at=YYYY-MM-DD \
  --confirm-hf \
  --confirm-anonymization \
  --confirm-debrief \
  --apply
```

이 도구는 `sourceRightsComplete=true`가 이미 확정된 시나리오만 승격한다. 따라서 source/rights 증거가 남아 있는 S01/S02를 사람 승인만으로 우회 승격할 수 없다. 기본 실행은 preflight-only이며 `--apply` 없이는 저장소를 변경하지 않는다.


### Source evidence 자동 확인

```bash
pnpm check:source-evidence
```

`sourceRightsComplete=true`만 수동으로 바꿔서는 경쟁 시나리오를 승격할 수 없다. `source-evidence.json`에서도 공식 사건 근거와 권리 근거가 모두 complete여야 promotion helper와 CI가 통과한다.
