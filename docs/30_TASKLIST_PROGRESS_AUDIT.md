# HERO TASKLIST 실제 진행 감사 — 2026-10-13

> 소스 기준: `main` / `5976d53020e96b92493d5bfc3f1b913360af0067`
> 자동검증 근거: PR #109 head `8176273d1d8b95b088173a5f9bfc2a82f80850c8`의 기존 성공 기록
> **구현 진도 / 최종 DoD·실기기·출시 승인과 구분 / 정식 v1.0 RELEASE BLOCKED**

> 후속 S03 v5 개정은 [개정 기록](S03_V5_LEARNING_COMPLETION_CHANGE.md)을 따른다. 아래 CI/배포·83.7%는 고정된 이전 소스 기준선의 근거이며 v5 전체 배포/실기기/최종 검증을 승계하지 않는다.

## 1. 현재 진척

- MVP Phase 0~7: **86개**. 구현 **63**, 부분 **18**, 미착수·완료 증거 없음 **5**.
- 관리용 가중 진도: `(63 + 18×0.5) / 86` = **83.7%**. 공수/난이도 가중치 또는 출시 준비율이 아니다.
- 구현 판정은 소스와 해당 자동검증 범위의 근거를 뜻한다. 사람 승인·실기기·별도 staging·파일럿까지 끝났다는 판정이 아니다.
- 10월 8일의 **75.6%**는 당시 기준이다. [당시 원본 기록](history/TASKLIST_PROGRESS_AUDIT_20261008.md)을 보존하며 현재 상태로 사용하지 않는다.
- 이번 세션은 기존 CI/API/파일을 재확인하고 문서·manifest를 검증한다. 브라우저168개·DB 테스트를 새로 실행했다는 기록을 만들지 않는다.

## 2. 최신 검증·배포 근거

| 근거 | 확인 내용 | 적용 범위 |
|---|---|---|
| [PR #109](https://github.com/worldinyj/HERO/pull/109) | 10월13일 06:46 KST 병합·운영 배포·48개 파일/경로 일치·로컬/원격0/0 기록 | 배포 완료 기록; 이번 세션의 운영 재검사 아님 |
| [CI](https://github.com/worldinyj/HERO/actions/runs/38311828886) | SUCCESS | lint/typecheck/build·단위·Deno·콘텐츠/오디오·번들 검사 |
| [Database Policy Tests](https://github.com/worldinyj/HERO/actions/runs/38311828883) | SUCCESS | CI 로컬 PostgreSQL의 pgTAP; 원격 운영 DB 승인 아님 |
| [E2E](https://github.com/worldinyj/HERO/actions/runs/38311828884) | SUCCESS, PR에168개 PASS 기록 | 로컬 fixture/OAuth 모킹·Chromium 모바일/PC; 실기기 아님 |

구조화된 관측: `ops/development-snapshot-20261013.json`. 모든 근거는 위 고정 SHA에 한정하며 후속 코드 변경에 자동 승계하지 않는다.

## 3. Phase별 구현 진도

| Phase | 총 작업 | 구현 | 부분 | 미착수 | 가중 진도 |
|---|---:|---:|---:|---:|---:|
| 0 | 10 | 8 | 2 | 0 | 90.0% |
| 1 | 15 | 13 | 2 | 0 | 93.3% |
| 2 | 10 | 10 | 0 | 0 | 100.0% |
| 3 | 13 | 2 | 11 | 0 | 57.7% |
| 4 | 12 | 11 | 1 | 0 | 95.8% |
| 5 | 10 | 10 | 0 | 0 | 100.0% |
| 6 | 8 | 8 | 0 | 0 | 100.0% |
| 7 | 8 | 1 | 2 | 5 | 25.0% |
| **합계** | **86** | **63** | **18** | **5** | **83.7%** |

## 4. 이번 정정과 잔여 조건

- CI·Deno·pgTAP·전체 E2E의 기존 성공 근거를 반영해 T0-06, T1-03, T2-10, T4-08, T5-03/04/09, T6-01/01a/02, T7-01을 구현으로 정정했다. 정식 출시·실기기 판정은 별도다.
- 수리3포즈·KHNP 로고와 웹 화면 적용은 완료. T3-10의 계획된 초상화/배경/카드/도장 전체 제작은 미완료이므로 부분이다.
- 오디오 후보20개·등록17개가 존재하므로 T3-12/13은 미착수에서 부분으로 정정. 전체 계획 큐/큐별3안·모델 확인·정식 audioQc/실기기 검증은 남아 있다.
- `audioPolicy=included`로 실제 등록·포함 범위를 반영하지만 `approvals.audioQc=pending`을 유지한다. 사용자 청취/권리 확인과 기술 QC의 범위는 원본 검수 기록을 따른다.
- S01/S02는 SOURCE_HOLD, S03 v5는 REVIEW_READY·동일-SHA 사람 검토0/5. 경쟁 콘텐츠 승인0/3이다.
- 별도 staging 구성·같은 SHA Staging Smoke/RC, 법무/개인정보, 실기기4종, 사내망/개인폰 정책, 30명 파일럿·v1.0 승인 증거는 남아 있다.
- 실제 운영의 LCP/INP/CLS 및 LCP<2.5초는 측정하지 않았다. 번들 예산 통과를 LCP 개선으로 해석하지 않는다.
- 조직/담당자/초대 전체 목록은 서버 검색·페이지 처리 후속 대상이다. 결과 확인은 선택 ID 기준으로 보장해야 한다.

## 5. 다음 실행 순서

1. [S03 검토 인계](S03_REVIEW_HANDOFF_20261013.md)에 따라 현재v4·SHA의5개 영역을 실제 전문가가 검토한다.
2. 담당자가 결과 JSON을 preflight → 실제 근거 확인 후 가져오기 → 요약 갱신한다. 모든 동일-SHA PASS 후에만 최종 승격한다.
3. S01/S02 직접 원문·개별 이용조건을 확보하고 콘텐츠 검토를 진행한다.
4. 별도 staging·실기기·정책/법무·파일럿 증거를 수집하고 같은 SHA의 RC 게이트를 검증한다.
5. 운영 목록의 서버 검색·페이지 처리를 구현할 때 집계·검색·상태변경 결과 재확인을 분리한다.

## 6. 이번 문서 갱신의 로컬 검증

- `check:tasklist-progress`: 86개 ID·근거 파일·상태 무결성 PASS, 83.7% 재산정.
- `check:audio-manifest`: 17개 파일/approved 자산 PASS.
- 사람 검토 evidence·배포 요약·S03 자동 패킷 freshness·source evidence·cause traceability·promotion guard PASS. S03 상태는0/5로 유지됐다.
- `check:release-evidence`와 `check:mvp-readiness`: 정상 보고, 정식 출시 미준비 확인. MVP 게이트8 BLOCKED / 0 DEFERRED.
- 기존 사람 승인 객체·시나리오 JSON·런타임 코드가 변경되지 않았고 Markdown 로컬 링크가 유효함을 확인했다.
- 환경의 `tsx` CLI IPC 제한으로 TypeScript 검사는 같은 스크립트를 `node --import tsx scripts/...`로 실행했다. DB·브라우저168개·운영 검증은 이번 세션에서 재실행하지 않았다.
- 문서/증거 갱신 커밋은 `[skip ci]`로 저장하며 GitHub Actions를 별도로 실행하지 않는다.

## 7. 86개 항목별 현재 판정

| ID | 상태 | 근거 파일 | 한계/검증 범위 |
|---|---|---|---|
| T0-01 | 구현 | `apps/web/package.json` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T0-02 | 구현 | `apps/web/src/styles.css` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T0-03 | 구현 | `playwright.config.ts` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T0-04 | 구현 | `.github/workflows/ci.yml` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T0-05 | 부분 | `docs/09_DEPLOYMENT_BOOTSTRAP.md` | 운영 연결·배포 기록 존재; 분리 staging 프로젝트 및 동일-SHA Staging Smoke 증거 미완료 |
| T0-06 | 구현 | `apps/web/public/_redirects` | PR #109: Cloudflare 미리보기 성공·운영 배포·48개 파일/경로 일치; 독립 staging/RC 승인은 별도 |
| T0-07 | 부분 | `apps/web/src/features/auth/LoginPage.tsx` | 운영 Kakao 연동·로그인 기록 존재; 별도 계정 초대 E2E·4종 실기기 검증 증거 미완료 |
| T0-08 | 구현 | `apps/web/public/manifest.webmanifest` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T0-09 | 구현 | `apps/web/src/lib/kakaoShare.ts` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T0-10 | 구현 | `supabase/migrations/202610070013_initial_admin_bootstrap.sql` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T1-01 | 구현 | `supabase/migrations/202610070001_phase1_org_auth.sql` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T1-02 | 구현 | `supabase/migrations/202610070001_phase1_org_auth.sql` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T1-03 | 구현 | `supabase/tests/rls_role_matrix.test.sql` | PR #109 Database Policy Tests 성공: 역할/RLS/프라이버시 pgTAP; CI 로컬 DB 검증이며 운영 DB 재검증 아님 |
| T1-04 | 구현 | `supabase/functions/create-invite/index.ts` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T1-05 | 구현 | `supabase/functions/accept-invite/index.ts` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T1-06 | 구현 | `apps/web/src/features/auth/LoginPage.tsx` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T1-07 | 구현 | `apps/web/src/features/invite/InvitationPage.tsx` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T1-08 | 구현 | `apps/web/src/features/auth/RequireAuth.tsx` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T1-09 | 부분 | `apps/web/src/features/admin/AdminOrgPage.tsx` | 생성·활성/비활성 구현, 완전한 CRUD 중 삭제/관리정책 불확정 |
| T1-10 | 구현 | `apps/web/src/features/manager/ManagerDashboardPage.tsx` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T1-11 | 구현 | `apps/web/src/features/manager/ManagerInvitePanel.tsx` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T1-12 | 부분 | `docs/07_TERMS_PRIVACY_DRAFT.md` | 약관·개인정보 초안 존재; 법무·개인정보 책임자 승인 미완료 |
| T1-13 | 구현 | `supabase/migrations/202610070008_nickname_policy.sql` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T1-14 | 구현 | `supabase/migrations/202610070005_manager_dashboard.sql` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T1-15 | 구현 | `supabase/migrations/202610070009_audit_integrity.sql` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T2-01 | 구현 | `packages/schema/src/scenario.ts` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T2-02 | 구현 | `packages/schema/src/validation.ts` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T2-03 | 구현 | `packages/engine/src/catalog.ts` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T2-04 | 구현 | `packages/engine/src/engine.ts` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T2-05 | 구현 | `packages/engine/src/rng.ts` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T2-06 | 구현 | `packages/engine/src/score.ts` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T2-07 | 구현 | `packages/engine/src/engine.ts` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T2-08 | 구현 | `packages/engine/src/engine.ts` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T2-09 | 구현 | `packages/engine/src/simulator.ts` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T2-10 | 구현 | `supabase/functions/start-session/index.ts` | PR #109 CI quality 성공: 실제 Deno check·공유 엔진/Edge 그래프 검사 포함 |
| T3-01 | 부분 | `scenarios/research/T3_CANDIDATE_MATRIX_V1.md` | 후보 조사자료 존재; 원본·이용조건 추가 확인 필요 |
| T3-02 | 부분 | `scenarios/research/T3_SOURCE_RIGHTS_REVIEW_V1.md` | S01/S02 SOURCE_HOLD, S03 사람 검토 대기 |
| T3-03 | 부분 | `scenarios/research/S01_HF_BRIEF_V1.md` | 3개 HF brief 작성, 분야별 사람 검토/승인 미완료 |
| T3-04 | 부분 | `scenarios/drafts/S01_time_pressure_v1.json` | S01 JSON 초안 존재; 출처·사람 승인 대기 |
| T3-05 | 부분 | `scenarios/drafts/S02_equipment_identity_v1.json` | S02 JSON 초안 존재; 출처·사람 승인 대기 |
| T3-06 | 부분 | `scenarios/drafts/S03_procedure_reality_v1.json` | S03 JSON 초안 존재; HF·익명화 사람 승인 대기 |
| T3-07 | 부분 | `scenarios/research/T3_BALANCE_REPORT_V1.md` | 밸런스 보고서 있으나 경쟁 콘텐츠 승인·실기 검증 남음 |
| T3-08 | 구현 | `scenarios/data/S00_tutorial.json` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T3-09 | 부분 | `scenarios/research/T3_HF_REVIEW_CHECKLIST_V1.md` | 검토 패킷 존재; 검토자 서명·승인 미완료 |
| T3-10 | 부분 | `docs/03_UXUI.md` | 수리 3포즈 PNG/WebP·KHNP 로고 제작 및 화면 적용; 계획된 초상화 18개·배경5·카드8·도장4 전체 제작은 미완료 |
| T3-11 | 구현 | `assets/audio/prompts/AUDIO_PROMPTS_V1.md` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T3-12 | 부분 | `assets/audio/reviews/AUDIO_REVIEW_LOG.md` | Flow Music 후보20개와 provenance·보정본 존재; 큐별3안 전체 제작 및 실제 모델/제출 프롬프트 확정 미완료 |
| T3-13 | 부분 | `assets/audio/reviews/AUDIO_REVIEW_LOG.md` | 승인 manifest17개·사용자 권리/청취 확인·기술 QC 기록; 전체 계획 큐·실기기·정식 출시 audioQc 승인 미완료 |
| T4-01 | 구현 | `apps/web/src/app/App.tsx` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T4-02 | 구현 | `apps/web/src/features/play/CompetitiveCampaignChapters.tsx` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T4-03 | 구현 | `apps/web/src/features/play/SceneStage.tsx` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T4-04 | 구현 | `apps/web/src/features/play/ChoiceSheet.tsx` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T4-05 | 구현 | `apps/web/src/features/play/GameClock.tsx` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T4-06 | 구현 | `apps/web/src/features/play/components/BarrierCardTray.tsx` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T4-07 | 구현 | `apps/web/src/features/play/components/EventAlert.tsx` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T4-08 | 구현 | `apps/web/src/features/play/gameStore.ts` | PR #109 전체 E2E 성공: IndexedDB 이어하기·오프라인/재접속·제출 회귀; 실기기 검증은 T7-02 |
| T4-09 | 부분 | `apps/web/src/app/routeModules.ts` | PR #109 초기 JS gzip155357bytes·라우트 분할 검사 성공; 실제 LCP<2.5초 측정 미완료 |
| T4-10 | 구현 | `apps/web/src/features/audio/audioManager.ts` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T4-11 | 구현 | `apps/web/src/features/audio/AudioSettings.tsx` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T4-12 | 구현 | `apps/web/src/features/audio/audioManager.ts` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T5-01 | 구현 | `supabase/migrations/202610070003_sessions.sql` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T5-02 | 구현 | `supabase/functions/start-session/index.ts` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T5-03 | 구현 | `supabase/functions/submit-session/index.ts` | PR #109 CI·pgTAP·E2E 성공: 제출 재실행·위변조/원자성·동시성 검사; 운영 신규 테스트 미실행 |
| T5-04 | 구현 | `apps/web/src/lib/submissionQueue.ts` | PR #109 전체 E2E 성공: 오프라인 제출 큐·재접속 자동제출/복구 |
| T5-05 | 구현 | `apps/web/src/features/play/result/CausalReflection.tsx` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T5-06 | 구현 | `apps/web/src/features/play/result/SwissCheeseTimeline.tsx` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T5-07 | 구현 | `apps/web/src/features/play/result/HpReview.tsx` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T5-08 | 구현 | `apps/web/src/features/play/result/IncidentDebrief.tsx` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T5-09 | 구현 | `apps/web/src/features/play/competitiveReplay.ts` | PR #109 전체 E2E 성공: 결정지점 리플레이·오프라인 제출·결과 연계 |
| T5-10 | 구현 | `apps/web/src/features/admin/AdminScenarioPage.tsx` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T6-01 | 구현 | `supabase/migrations/202610070004_leaderboard_seasons.sql` | PR #109 pgTAP 성공: 시즌 점수/공개 projection 구현·테스트 확인; 분리 staging 적용 상태는 별도 |
| T6-01a | 구현 | `supabase/migrations/202610070004_leaderboard_seasons.sql` | PR #109 pgTAP 성공: season_rollover.test.sql의 KST 월 경계·스냅샷/멱등성 검사; 실제 운영 월말 관측 아님 |
| T6-02 | 구현 | `supabase/migrations/202610080016_leaderboard_public_projection.sql` | PR #109 pgTAP·E2E 성공: 공개 projection·담당자 역조회 차단; 별도 운영 DB 감사 아님 |
| T6-03 | 구현 | `apps/web/src/features/leaderboard/LeaderboardPage.tsx` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T6-04 | 구현 | `apps/web/src/features/leaderboard/CampaignRankCard.tsx` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T6-05 | 구현 | `apps/web/src/features/profile/ProfilePage.tsx` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T6-06 | 구현 | `apps/web/src/features/manager/ManagerDashboardPage.tsx` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T6-07 | 구현 | `scripts/analyze-hp-balance.ts` | 기준선 main 소스 확인; PR #109 CI quality·pgTAP·E2E 성공 근거 참조. 항목별 실기기/사람 승인·최종 DoD 완료와 구분 |
| T7-01 | 구현 | `e2e/invite-play-leaderboard.spec.ts` | PR #109 전체 브라우저168개 PASS 기록·mobile-flow SUCCESS: 360/390px·OAuth 모킹/로컬 fixture; 실제 Kakao OAuth·실기기는 제외 |
| T7-02 | 미착수/증거 없음 | `docs/14_KAKAO_LIVE_INVITE_VALIDATION.md` | 모바일 실제 기기 4종 검증 증거 없음 |
| T7-03 | 부분 | `.github/workflows/ci.yml` | PR #109 자동 axe·가로 넘침·767/768px 경계 검증 성공; 실기기/스크린리더 수동 평가 미완료 |
| T7-03a | 미착수/증거 없음 | `docs/06_AUDIO_ASSET_GUIDE.md` | 사용자 보정본 청취 확인은 존재; iOS/Samsung 실기기·통화/백그라운드 복귀 QC 증거 없음 |
| T7-04 | 부분 | `docs/12_SUPABASE_SECURITY_ADVISOR_REVIEW.md` | PR #109 CI 비밀값·pgTAP 권한/RLS·rate limit·프라이버시 검사 성공; 최신 운영 Security Advisor/전체 수동 감사 미확인 |
| T7-05 | 미착수/증거 없음 | `docs/10_MVP_READINESS.md` | 사내망·개인폰 접속 정책 승인 증거 없음 |
| T7-06 | 미착수/증거 없음 | `ops/release-evidence.json` | 파일럿 30명 운영·사전사후 결과 없음 |
| T7-07 | 미착수/증거 없음 | `docs/10_MVP_READINESS.md` | 파일럿 전·사람 승인 전이므로 v1.0 릴리스 불가 |
