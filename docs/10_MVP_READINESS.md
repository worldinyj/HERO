# HERO MVP Release Readiness

| 항목 | 상태 |
|---|---|
| 기준일 | 2026-10-07 |
| 코드 기준선 | `main` |
| 대상 | MVP Release 1 |
| 현재 판정 | **프로덕션 RELEASE BLOCKED / 내부 개발·통합 준비 완료에 가까움** |
| 자동 확인 | `pnpm check:mvp-readiness` |
| 출시 강제 게이트 | `pnpm check:mvp-readiness -- --strict` |

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
| 인증·초대·역할·RLS | **READY (코드)** | 역할 매트릭스 pgTAP, 1회용 초대, 최초 admin bootstrap |
| 감사로그·rate limit·secret guard | **READY** | append-only audit, service-role limiter, client-secret CI |
| 튜토리얼·경쟁 플레이·리플레이 | **READY (코드)** | server session, offline persistence/queue, replay lineage |
| PWA·오프라인 셸 | **READY** | manifest, service worker, install shell, CI 검증 |
| 리더보드·월간 시즌 | **READY (코드)** | pagination, KST rollover test, snapshot, self rank |
| 담당자 프라이버시 | **READY (코드)** | 개인 점수/선택 차단, n<5 억제, 닉네임↔HP 역조회 차단 |
| 접근성 | **READY (자동 게이트)** | WCAG 2.2 AA 자동 검사, reduced motion, 키보드/포커스 |
| 모바일 핵심 E2E | **READY (자동 게이트)** | 초대→가입→플레이→결과→리더보드 자동 플로우 |
| S00 튜토리얼 | **APPROVED** | competitive source gate 예외 |
| S01 | **SOURCE_HOLD** | 원안위 공식 사건명·INES 2 + 과거 OPIS 목록/현재 NSIC 진입점 확인. 사건별 direct URL/식별번호, 2012 KHNP 개별 이용표시, HF/익명화 승인 남음 |
| S02 | **SOURCE_HOLD** | KHNP 2024-01-02 공식 사건 시계열 + 2024-04-17 원안위 보도자료 전문 확보. 원안위 직접 조사 원문/개별 이용표시, OPIS/NSIC 사건별 상세 레코드, HF/익명화 승인 남음 |
| S03 | **REVIEW_READY** | HF·익명화·과노출·incidentDebrief 사람 승인 |
| 약관·개인정보 | **BLOCKED** | `[확정 필요]` 항목과 법무/개인정보 검토 잔존 |
| 외부 배포 | **BLOCKED** | staging/prod Supabase, Cloudflare, Kakao 설정 실확인 필요 |
| 오디오 | **DEFERRED** | 생성·검수는 별도 진행. manifest는 아직 승인 asset 0건 |
| 실기기·사내망 | **BLOCKED** | Kakao 인앱, Android Chrome, Samsung Internet, iOS Safari, 사내망 정책 |
| 파일럿 | **BLOCKED** | 파일럿 발전소 1곳·30명 운영과 KPI 측정 필요 |

## 3. 자동 검증과 사람 게이트의 경계

### 자동으로 닫힌 항목

저장소 CI에서 다음을 지속 검증한다.

- 코드 lint/typecheck/test/build
- 시나리오 schema/graph/promotion guard
- source-evidence ↔ promotion-status 출처·권리 일관성 guard
- S00 및 draft path simulation
- HP 파밍·리플레이 밸런스 guard
- PWA 설치 셸
- Deno Edge Function 타입검사
- audit helper 우회 금지
- DB RLS·manager privacy·rate limit pgTAP
- 모바일 핵심 E2E
- WCAG 2.2 AA 핵심 자동점검
- 브라우저 번들 secret 노출 방지

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
- JSON이 `scenarios/data/`에 존재
- CI promotion/schema/path/balance gate PASS

현재는 S01/S02가 `source_hold`, S03이 `review_ready`이므로 **경쟁 시나리오 3종 출시 게이트는 아직 열리지 않는다.**

## 5. 외부 운영 준비 순서

1. **S03 사람 검토**를 먼저 수행해 첫 경쟁 시나리오 승인 절차를 실제로 한 번 끝낸다.
2. S01/S02의 남은 직접 원문·개별 이용조건·OPIS 레코드 식별을 확정하고 동일 사람 검토를 수행한다.
3. 개인정보 운영주체·담당부서·보유기간·처리위탁/국외이전을 확정한다.
4. staging Supabase + Cloudflare + Kakao 환경을 연결한다.
5. 최초 admin bootstrap과 관리자→담당자→사용자 실제 초대 플로우를 검증한다.
6. 실기기/사내망 테스트를 수행한다.
7. 오디오를 넣을 경우 승인 asset만 manifest에 등록하고 실기기 QC를 수행한다.
8. 파일럿 1개 발전소·30명 운영 후 KPI/Blocker를 검토한다.
9. Blocker 0일 때 v1.0 프로덕션 릴리스를 승인한다.

## 6. readiness 명령

기본 모드는 현재 상태를 **보고**하고, 의도된 사람/외부 blocker 때문에 CI를 실패시키지 않는다.

```bash
pnpm check:mvp-readiness
pnpm check:mvp-readiness -- --json
```

실제 Release Candidate 판정 때는 strict 모드를 사용한다.

```bash
pnpm check:mvp-readiness -- --strict
```

strict 모드는 BLOCKED 또는 DEFERRED gate가 남아 있으면 non-zero exit code를 반환한다.

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
