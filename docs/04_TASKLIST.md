# HERO — Task List

| 항목 | 내용 |
|---|---|
| 문서 버전 | **v1.3** (v1.2 + BGM/SFX 제작·웹 재생·검수 파이프라인 반영) |
| 작성일 | 2026-10-07 |
| 근거 | [01_PRD](01_PRD.md) · [02_TRD](02_TRD.md) · [03_UXUI](03_UXUI.md) · [05_TRACEABILITY](05_TRACEABILITY.md) |

**표기**: 담당 에이전트 = ATLAS(총괄) · SAGE(HF) · STORY(시나리오) · LOOP(게임디자인) · FORGE(개발) · GUARD(QA) · 👤(사용자 확인 필요)
**규모**: S ≤ 0.5일 · M ≤ 2일 · L ≤ 5일
**완료 기준(DoD)**: 코드 리뷰 · 테스트 통과 · 모바일(360px) 확인 · 관련 문서 갱신

---

## Phase 0 — 기반 구축 (1주)

| ID | 작업 | 담당 | 규모 | 선행 | 산출물/완료 기준 |
|---|---|---|---|---|---|
| T0-01 | pnpm 모노레포 스캐폴딩 (`apps/web`, `packages/engine`, `packages/schema`) | FORGE | S | — | `pnpm dev` 동작 |
| T0-02 | Vite 8.x + React 19.3+ + TS + Tailwind 4.x + Router, 디자인 토큰(Dark/Light) 적용 | FORGE | M | T0-01 | UXUI §1.2 토큰 CSS 변수 |
| T0-03 | ESLint/Prettier/Vitest/Playwright 설정 | FORGE | S | T0-01 | CI 로컬 통과 |
| T0-04 | GitHub Actions CI (lint·typecheck·test·build) | FORGE | S | T0-03 | PR마다 실행 |
| T0-05 | Supabase 프로젝트 생성 (staging/prod) 👤 | ATLAS | S | — | URL·키 Secrets 등록 |
| T0-06 | Cloudflare Pages 연결, SPA fallback 확인·`_headers`·PR 프리뷰 👤 | FORGE | S | T0-02 | 프리뷰 deep-link 새로고침·보안헤더 동작 |
| T0-07 | Kakao Developers 앱 등록(도메인·Redirect URI·최소 동의항목, 이메일/프로필 비필수) + Supabase Kakao Provider `Allow users without an email` 설정 👤 | FORGE | S | T0-05, T0-06 | 카카오 로그인 성공 · 불필요 개인정보 scope 미요청 |
| T0-08 | PWA 설정 (manifest, 아이콘, 오프라인 셸) | FORGE | S | T0-02 | Lighthouse PWA 통과 |
| T0-09 | Kakao JS SDK 연동, 카카오톡 공유 피드 템플릿·OG 이미지 | FORGE | S | T0-07 | 테스트 공유 수신 |
| T0-10 | 최초 admin 부트스트랩 절차(seed/수동 승격) + 공개 관리자 가입 차단 | FORGE+GUARD | S | T0-05 | 비관리자가 admin 획득 불가 테스트 |

## Phase 1 — 인증·조직·초대 (1.5주)

| ID | 작업 | 담당 | 규모 | 선행 | 완료 기준 |
|---|---|---|---|---|---|
| T1-01 | 마이그레이션: enum, plants, profiles(닉네임), invitations(token_hash), audit_logs | FORGE | M | T0-05 | `supabase db push` 성공 |
| T1-02 | RLS 정책 + `auth_role()/auth_plant()` | FORGE | M | T1-01 | 역할별 허용/거부 테스트 통과 |
| T1-03 | RLS 통합 테스트 (admin/manager/player × 테이블) | GUARD | M | T1-02 | 매트릭스(TRD §5.2) 전부 검증 |
| T1-04 | Edge `create-invite` (권한 검증·1회용 토큰·감사로그·rate limit) + `peek-invite` | FORGE | M | T1-02 | 관리자→담당자, 담당자→사용자만 허용 |
| T1-05 | Edge `accept-invite` (토큰 1회 소비·profiles 생성/동일 발전소 갱신, 타 발전소 active 계정 자동이동 금지) | FORGE | M | T1-04 | 만료/취소/재사용/교차발전소 수락 거부, 동시수락 경합 테스트 |
| T1-06 | 로그인 화면 (카카오 로그인) | FORGE | S | T0-07 | UXUI §4.1 |
| T1-07 | 초대 미리보기 + 온보딩 3단계 (본인확인·닉네임 중복/금칙어·인사평가 무관 동의) | FORGE | M | T1-05 | UXUI §4.2, 카톡 인앱 브라우저 동작 |
| T1-08 | 라우트 가드 `RequireAuth/RequireRole` | FORGE | S | T1-06 | 권한 없는 라우트 차단 |
| T1-09 | 관리자: 발전소 CRUD, 담당자 초대 | FORGE | M | T1-04 | UXUI §4.15 |
| T1-10 | 담당자: 초대 링크 생성·**카톡 공유**·링크 복사·새 링크·취소·수락자 확인/비활성화 | FORGE | M | T1-04, T0-09 | UXUI §4.14 |
| T1-11 | 담당자: CSV 일괄 링크 생성 (행별 카톡 공유·링크 CSV 다운로드) | FORGE | M | T1-10 | 200건 처리 |
| T1-12 | 이용약관·개인정보 문안 + **"인사평가 무관" 고지 문구 반영**(로그인·온보딩·리더보드) | ATLAS | S | — | 법무/교육부서 검토 👤 |
| T1-13 | 닉네임 정책: 금칙어 필터, **활성 시즌당 1회** 변경, 담당자 초기화 | FORGE | S | T1-07 | |
| T1-14 | `manager_participation_view`·`manager_aggregate_view` 설계: 개인 점수/선택 차단, n<5 집계 억제 | FORGE+GUARD | M | T1-02 | 프라이버시 회귀 테스트 |
| T1-15 | P0 감사로그 공통 모듈/정책: 초대·수락·권한변경·비활성화·점수조정·시즌마감 기록, 일반 사용자 수정/삭제 차단 | FORGE+GUARD | M | T1-01, T1-02 | F-ADM-03 이벤트별 감사로그·불변성 테스트 |

## Phase 2 — 게임 엔진 (2주, Phase 1과 병행 가능)

| ID | 작업 | 담당 | 규모 | 선행 | 완료 기준 |
|---|---|---|---|---|---|
| T2-01 | 시나리오 Zod 스키마 + JSON Schema 산출 | FORGE | M | T0-01 | TRD §7 반영 |
| T2-02 | 시나리오 검증 CLI (참조 무결성·도달성·엔딩·길이) | FORGE | M | T2-01 | `pnpm validate:scenario` |
| T2-03 | PSF 배수표·Barrier 정의·HU Tool 카드 카탈로그 | SAGE+LOOP | M | — | `engine/catalog.ts`, 근거 주석(SPAR-H 참조) |
| T2-04 | 엔진 코어: createGame/act/getView (Hazard Index 비노출) | FORGE | L | T2-01, T2-03 | 단위테스트 |
| T2-05 | Hidden **Hazard Index** 판정 + 시즌×시나리오 공통 simulation seed / 세션별 presentation seed 분리 | FORGE | M | T2-04 | 동일 simulation seed·로그 → 동일 결과, 표시순서만 독립 |
| T2-06 | 5대 학습행동 지표·시나리오 HP(최대310)·score_rule_version 구현 | FORGE+LOOP | M | T2-04 | PRD §7 산식·서버/클라이언트 동일 |
| T2-07 | breachChain·keyDecision 추적 | FORGE | M | T2-05 | Swiss Cheese 데이터 |
| T2-08 | replayFrom (결정 지점부터 재시작) | FORGE | S | T2-04 | 테스트 |
| T2-09 | 경로 탐색 시뮬레이터 (전 경로 엔딩 분포·정답편향 경고) | LOOP+FORGE | M | T2-06 | 시나리오별 리포트 |
| T2-10 | Deno 호환 빌드 확인 (Edge에서 import) | FORGE | S | T2-04 | Edge 테스트 함수 통과 |

## Phase 3 — MVP 시나리오 콘텐츠 (2주, Phase 2와 병행)

| ID | 작업 | 담당 | 규모 | 선행 | 완료 기준 |
|---|---|---|---|---|---|
| T3-01 | OPIS 인적오류 사건 후보 수집 (10~15건 PDF) 👤 | SAGE | M | — | 이용조건 확인, 후보 목록 |
| T3-02 | 후보 선별 (PRD §8.2: 의사결정·시스템적 학습성·공개적합성) → S01~S03 근거사건 확정 👤 | SAGE | S | T3-01 | 선별표 |
| T3-03 | 사건별 HF 분석 (**Direct Cause·Root Cause·Contributing Cause/Factor**·Timeline·PSF·Precursor·Barrier·Causal Chain·Corrective Action Traceability) | SAGE | M | T3-02 | 분석서 3건 |
| T3-04 | S01 "오늘 오전까지" 시나리오 작성 (scene·대사·익명화) | STORY | M | T3-03 | JSON 초안 |
| T3-05 | S02 "아마 이 설비가" | STORY | M | T3-03 | JSON 초안 |
| T3-06 | S03 "절차와 실제가" | STORY | M | T3-03 | JSON 초안 |
| T3-07 | 선택지·비용·효과·카드·엔딩 밸런싱 (3종) | LOOP | L | T3-04~06, T2-09 | 각 엔딩 도달, 정답편향 경고 0 |
| T3-08 | 튜토리얼 0장 (조작법 30초) | STORY+LOOP | S | T2-04 | JSON |
| T3-09 | 콘텐츠 검토: HF 정확성·**개인오류 귀결 방지**·익명화·운전절차 과노출·Hazard Index 오해 방지 👤 | GUARD+SAGE | M | T3-07 | 체크리스트 서명 |
| T3-10 | 아트 에셋 제작 (초상화 6×3, 배경 5, 카드 8, 도장 4) | ATLAS 👤 | L | T3-04 | UXUI §9 사양 |
| T3-11 | 오디오 브리프·prompt pack 작성: BGM 5루프+엔딩 stinger, SFX 10~15종 | LOOP+STORY+SAGE | M | T3-04~06 | `assets/audio/prompts/`, 실제 경보음 유사 요소 금지 |
| T3-12 | Google Flow Music/Lyria 중심 BGM 생성 + SFX/foley 후보 생성, 후보별 provenance 기록 👤 | ATLAS+LOOP | M | T3-11 | 후보 3안/큐, source tool/model/prompt 기록 |
| T3-13 | 오디오 HF·권리·기술 QC: 인지부하/경보 혼동/약관/peak/loop 검수 → 승인 export | SAGE+GUARD | M | T3-12 | 승인 MP3 + review 기록 + manifest |

## Phase 4 — 플레이 UI (2주)

| ID | 작업 | 담당 | 규모 | 선행 | 완료 기준 |
|---|---|---|---|---|---|
| T4-01 | 하단 탭 레이아웃, 캠페인 맵 | FORGE | M | T1-08 | UXUI §4.3 |
| T4-02 | 장 소개(출진) 화면 | FORGE | S | T4-01 | §4.4 |
| T4-03 | `SceneStage`·`DialogueBox` (타이핑·스킵) | FORGE | M | T2-04 | §4.5 |
| T4-04 | `ChoiceSheet` (2탭 확정, presentation seed 셔플, action_id 안정성) | FORGE | M | T4-03 | 오조작·통계 ID 정합성 테스트 |
| T4-05 | `GameClock`, 정보 행동 칩·카드 | FORGE | M | T4-03 | 시간 소모 연출 |
| T4-06 | `BarrierCardTray` + 사용 연출 | FORGE | M | T4-03 | §4.5 |
| T4-07 | `EventAlert`, 엔딩 도장 4종 | FORGE | M | T4-03 | §4.6~4.7 |
| T4-08 | Zustand 게임 스토어 + IndexedDB 자동저장·이어하기 + 오프라인 배너 | FORGE | M | T4-03 | 시작된 세션은 오프라인 계속, 신규 시작은 온라인 제한 |
| T4-09 | 에셋 프리로드·코드분할 | FORGE | S | T4-03 | LCP < 2.5s |
| T4-10 | `AudioManager` 구현: 사용자 제스처 unlock, BGM crossfade/ducking, SFX voice limit, 재생 실패 graceful fallback | FORGE | M | T3-13 | TRD §11.1 |
| T4-11 | `AudioSettings`: BGM/SFX 독립 mute·volume·reduced-sensory, 로컬 설정 저장 | FORGE | S | T4-10 | UXUI §4.13A |
| T4-12 | 오디오 lazy-load/cache: 필수 SFX precache, BGM scene-load, 오프라인 이어하기 검증 | FORGE | S | T4-10, T4-08 | 초기 LCP에 BGM 다운로드 없음 |

## Phase 5 — 세션·결과·리플레이 (1.5주)

| ID | 작업 | 담당 | 규모 | 선행 | 완료 기준 |
|---|---|---|---|---|---|
| T5-01 | 마이그레이션: scenarios, scenario_versions, play_sessions, session_decisions | FORGE | S | T1-01 | |
| T5-02 | Edge `start-session` (버전·시즌 확정, simulation/presentation seed 발급, 조직직무/관점 snapshot) | FORGE | M | T5-01 | 모든 참가자 동일 simulation seed 확인 |
| T5-03 | Edge `submit-session` (엔진 재실행·검증·flag) | FORGE | M | T2-10, T5-02 | 위변조 로그 거부 테스트 |
| T5-04 | 오프라인 제출 큐 | FORGE | S | T5-03 | 재접속 시 자동 제출 |
| T5-05 | `CausalReflection` "어느 시점부터 방어막이 약해졌을까요?" | FORGE | S | T5-03 | UXUI §4.8, 정답/오답 비난 금지 |
| T5-06 | `SwissCheeseTimeline` (+ 지점별 리플레이 버튼) | FORGE | M | T2-07 | §4.9 |
| T5-07 | HP 리뷰 (`HpRadar`, 위험요인, 핵심결정, HP 내역) + "학습행동 지표/인사평가 아님" 안내 | FORGE | M | T5-03 | UXUI §4.10 |
| T5-08 | 실사건 공개 화면 | FORGE | S | T5-07 | §4.11 |
| T5-09 | 리플레이 플로우 (replay_of 기록) | FORGE | S | T2-08 | 재도전 점수 규칙 반영 |
| T5-10 | 시나리오 JSON 업로드·상태관리 (관리자) | FORGE | M | T5-01, T2-02 | 검증 실패 시 업로드 거부 |

## Phase 6 — 리더보드 (1주)

| ID | 작업 | 담당 | 규모 | 선행 | 완료 기준 |
|---|---|---|---|---|---|
| T6-01 | seasons, `v_season_scores`, materialized view + pg_cron: **시나리오별 최고 HP 합** 계약 구현 | FORGE | M | T5-03 | PRD §7과 SQL 결과 일치 |
| T6-01a | **월별 시즌 자동화**: 매월 1일 00:00 KST 전월 마감·스냅샷·신규 시즌 생성 (pg_cron) | FORGE | S | T6-01 | 월 경계 테스트(KST/UTC) |
| T6-02 | 리더보드 공개 뷰(**닉네임**·발전소·조직직무·HP·전체/발전소/직무/발전소×직무 순위만) | FORGE | M | T6-01 | 실명·개인지표·선택·엔딩 미노출 |
| T6-03 | 리더보드 화면 (전체/발전소/직무, 월 선택, 무한스크롤, 내 순위 고정) | FORGE | M | T6-02 | §4.12 |
| T6-04 | 캠페인 헤더 순위·상위% 표시 | FORGE | S | T6-03 | |
| T6-05 | 내 기록 화면 (개인용 누적 학습행동 프로필·장별 최고 기록·시즌 이력) | FORGE | M | T5-07 | UXUI §4.13 |
| T6-06 | 담당자 참여현황: 초대/수락/완료수/최근활동 + 익명 집계(n<5 억제), 개인 점수·선택 금지 | FORGE | M | T1-14, T6-01 | UXUI §4.14 |
| T6-07 | HP Point 밸런스 시뮬레이션 (파밍·리플레이 남용 검토) | LOOP+GUARD | S | T6-01 | 리포트 |

## Phase 7 — 검증·파일럿 (1.5주)

| ID | 작업 | 담당 | 규모 | 선행 | 완료 기준 |
|---|---|---|---|---|---|
| T7-01 | E2E: 초대링크→카카오 로그인(모킹)→수락→플레이→결과→리더보드 (모바일 뷰포트 2종) | GUARD | M | Phase 6 | Playwright 통과 |
| T7-02 | 실기기 테스트 (**카카오톡 인앱 브라우저**/Android Chrome/Samsung Internet/iOS Safari) | GUARD 👤 | S | T7-01 | 이슈 0 (Blocker) |
| T7-03 | 접근성 점검 (WCAG 2.2 AA: 대비·키보드/포커스·스크린리더·글자크기·오디오 없이 정보동등성) | GUARD | M | T7-01 | AA 핵심 기준 통과 |
| T7-03a | 오디오 실기기 QC: autoplay unlock, iOS/Samsung Internet, 통화/백그라운드 복귀, mute/volume, 실제 경보 혼동성 사용자 검토 | GUARD+SAGE 👤 | S | T4-10~12 | Blocker 0 |
| T7-04 | 보안·프라이버시 점검 (RLS 우회·키 노출·rate limit·담당자 개인성과 역조회) | GUARD | M | T7-01 | |
| T7-05 | 사내망/개인폰 접속 정책 확인 👤 | ATLAS | S | — | 접속 가이드 |
| T7-06 | 파일럿 발전소 1곳 · 30명 운영 + 사전/사후 설문 👤 | ATLAS | M | T7-02 | PRD §10 KPI 측정 |
| T7-07 | 피드백 반영 · v1.0 릴리스 | ATLAS | M | T7-06 | 프로덕션 배포 |

**MVP 예상 기간: 약 10~11주** (Phase 1·2·3 및 오디오 제작 Phase 3~4 병행 기준)

---

## Release 2 백로그

| ID | 작업 | 담당 | 규모 |
|---|---|---|---|
| R2-01 | opis_reports 테이블·Storage 버킷·업로드 UI | FORGE | M |
| R2-02 | 브라우저 pdf.js 텍스트 추출 (+스캔본 OCR 방안) | FORGE | M |
| R2-03 | `ai-analyze` Edge (구조화 출력 프롬프트, 익명화 후처리) | FORGE+SAGE | L |
| R2-04 | `ai-draft-scenario` (분석 → 시나리오 JSON 초안, 스키마 강제) | FORGE+STORY | L |
| R2-05 | 검토 체크리스트·서명 워크플로 | FORGE+GUARD | M |
| R2-06 | 칭호·배지 시스템 | LOOP+FORGE | M |
| R2-07 | 발전소 대항전 탭 | FORGE | M |
| R2-08 | 결정 지점별 선택 분포 (플레이어용·관리자 히트맵) | FORGE | M |
| R2-09 | 월별 시즌 포상 CSV 내보내기(관리자 전용, 닉네임+실명)·감사로그 | FORGE | M |
| R2-10 | 부정행위 탐지 플래그 대시보드 | FORGE+GUARD | M |
| R2-11 | 시나리오 4~10호 제작 (직무 커버리지 확대) | SAGE+STORY+LOOP | L |
| R2-12 | **카카오 알림톡** 일괄 초대 (비즈채널·템플릿 심사, 대행 API, 전화번호 별도 동의) 👤 | FORGE | M |
| R2-13 | 카카오 미사용자 예외 계정 발급(담당자 경유) | FORGE | S |
| R2-14 | 누적(Lifetime) 리더보드 + 시즌 간 점수 정규화 정책 | LOOP+FORGE | M |
| R2-15 | 다중 관점(perspective_role) 시나리오·관점 선택/배정 + 동일 관점 랭킹 정책 | SAGE+LOOP+FORGE | L |
| R2-16 | 사용자 발전소 이동/전출입 승인 워크플로 + 이력/감사로그 | FORGE+GUARD | M |

## Release 3+ 백로그
- Daily Challenge (2~3분 단일 판단) · Survival Mode
- **Team Mode** — 직무별 상이 정보 실시간 협업 (Supabase Realtime)
- 시각적 시나리오 그래프 편집기 + 미리보기
- 사내 SSO 연동

---

## 의존성 요약

```
Phase0 ─┬─ Phase1(인증) ──────────┐
        ├─ Phase2(엔진) ─┬────────┼─ Phase4(UI) ─ Phase5(결과) ─ Phase6(리더보드) ─ Phase7
        └─ Phase3(콘텐츠) ┘        │
                                  └─ (T1-08 가드 → T4-01)
```

## 사용자(👤) 결정·제공 필요 항목
1. Supabase·Cloudflare 계정 및 GitHub 저장소 접근 권한
2. Kakao Developers 앱 등록 계정 (R2 알림톡 시 카카오톡 채널·비즈니스 인증)
3. OPIS 보고서 이용조건 확인 및 후보 사건 PDF
4. 서비스명 최종 확정 (HERO / 한순간의 선택 / STOP! 등)
5. 포상 세부 기준 (기본원칙 확정: 닉네임 노출 · 월별 시즌 · 인사평가/징계 무관 · 카카오톡 초대)
6. 파일럿 발전소·인원, 이용약관 검토 부서
7. Google Flow Music/Gemini 생성 계정 및 생성 오디오 사용약관 검토 담당
