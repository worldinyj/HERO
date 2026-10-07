# HERO — TRD (Technical Requirements Document)

| 항목 | 내용 |
|---|---|
| 문서 버전 | **v1.4** |
| 작성일 | 2026-10-07 |
| 근거 | [01_PRD](01_PRD.md) |
| 관련 | [03_UXUI](03_UXUI.md) · [04_TASKLIST](04_TASKLIST.md) · [05_TRACEABILITY](05_TRACEABILITY.md) · [06_AUDIO_ASSET_GUIDE](06_AUDIO_ASSET_GUIDE.md) |

---

## 1. 아키텍처

```text
Cloudflare Pages
└─ React SPA / PWA
   ├─ UI / Router / Zustand
   ├─ @hero/engine (순수 TypeScript)
   ├─ scenario JSON
   └─ static assets (image + approved audio)
            │
            │ supabase-js (anon + JWT)
            ▼
Supabase
├─ Auth: Kakao OAuth
├─ Postgres + RLS
├─ Storage: OPIS PDF / 내부 제작자료
├─ Edge Functions
│  ├─ create-invite / peek-invite / accept-invite
│  ├─ start-session / submit-session
│  └─ leaderboard-snapshot
└─ pg_cron: 월별 시즌 생성·마감

Release 2
├─ OPIS PDF → 분석/시나리오 초안 LLM
└─ 카카오 알림톡
```

### ADR
| ID | 결정 | 이유 |
|---|---|---|
| ADR-01 | Vite + React SPA | 모바일 게임 중심, SSR 불필요, Pages 정적 배포 단순화 |
| ADR-02 | `@hero/engine`을 DOM 비의존 순수 TS로 분리 | 클라이언트와 Edge가 같은 계산 코드를 사용해 점수 위변조 방지 |
| ADR-03 | 시나리오는 JSON 데이터 | 버전관리·검증·AI 초안 생성에 유리 |
| ADR-04 | `simulation_seed`와 `presentation_seed` 분리 | 전자는 경쟁 공정성, 후자는 선택지 표시 순서 셔플 |
| ADR-05 | 권한은 Postgres RLS로 강제 | 발전소 간 데이터 격리 |
| ADR-06 | 초대/점수확정은 Edge Function에서 처리 | service role·비밀키 클라이언트 노출 금지 |
| ADR-07 | 리더보드는 닉네임 전용 공개뷰 | 실명 비노출 |
| ADR-08 | 담당자 개인성과 조회 금지 | Just Culture·인사평가 무관 원칙 기술적 강제 |
| ADR-09 | 오디오는 제작 단계에서 생성 후 승인된 정적 파일로 배포 | 일관성·오프라인·저지연·권리 검수 |
| ADR-10 | 오디오 manifest로 출처·모델·프롬프트·검수상태 추적 | 생성자산 provenance 관리 |

---

## 2. 기술 스택

| 영역 | 선택 |
|---|---|
| 언어 | TypeScript strict |
| Web | Vite 8.x, React 19.3+, React Router 7 |
| UI | Tailwind CSS 4.x, Radix UI |
| 상태 | Zustand + TanStack Query |
| 애니메이션 | Framer Motion |
| 오디오 런타임 | Web Audio API + HTMLAudioElement fallback |
| 오디오 제작 | Google Flow Music / Lyria 3.5 중심, SFX는 승인된 생성 도구 |
| 검증 | Zod + JSON Schema |
| PWA | vite-plugin-pwa / Workbox |
| Backend | Supabase Auth/Postgres/RLS/Storage/Edge/pg_cron |
| 배포 | Cloudflare Pages |
| 테스트 | Vitest, Playwright, RLS 통합테스트 |
| CI | GitHub Actions |

---

## 3. 저장소 구조

```text
HERO/
├─ apps/web/
│  ├─ src/
│  │  ├─ app/
│  │  ├─ features/
│  │  │  ├─ auth/
│  │  │  ├─ campaign/
│  │  │  ├─ play/
│  │  │  ├─ review/
│  │  │  ├─ leaderboard/
│  │  │  ├─ profile/
│  │  │  └─ admin/
│  │  └─ lib/audio/
│  ├─ public/assets/
│  └─ public/audio/
│     ├─ audio_manifest.json
│     ├─ bgm/
│     └─ sfx/
├─ assets/audio/
│  ├─ prompts/
│  └─ reviews/
├─ packages/
│  ├─ engine/
│  └─ schema/
├─ scenarios/
├─ supabase/
│  ├─ migrations/
│  └─ functions/
├─ docs/
└─ .github/workflows/
```

---

## 4. 데이터 계약

### 4.1 핵심 엔터티
- `plants`
- `profiles`
- `invitations`
- `scenarios`
- `scenario_versions`
- `play_sessions`
- `session_decisions`
- `seasons`
- `leaderboard_snapshots`
- `audit_logs`
- R2: `opis_reports`, `scenario_sources`

### 4.2 역할/직무
```sql
create type app_role as enum ('admin','plant_manager','player');
create type job_role as enum ('sro','ro','field_operator','supervisor','worker');
```

`job_role`은 조직 직무이며 `perspective_role`과 분리한다.

### 4.3 play_sessions 핵심 필드
```text
id
user_id
plant_id                 # 플레이 시점 소속 snapshot
player_job_role          # 조직 직무 snapshot
perspective_role         # 시나리오 플레이 관점
scenario_version_id
simulation_seed
presentation_seed
replay_of
replay_from_node
status
ending
metrics
hp_point
score_rule_version
started_at / completed_at
```

### 4.4 시즌 점수
시즌 점수는 PRD와 동일하게 **시나리오별 최고 HP의 합**이다.

```sql
with best_per_scenario as (
  select
    ps.user_id,
    sv.scenario_id,
    max(ps.hp_point) as best_hp
  from play_sessions ps
  join scenario_versions sv on sv.id = ps.scenario_version_id
  where ps.status = 'completed'
    and ps.completed_at >= :season_start
    and ps.completed_at <  :season_end
  group by ps.user_id, sv.scenario_id
)
select user_id, sum(best_hp) as season_hp
from best_per_scenario
group by user_id;
```

시즌 마감 후 `leaderboard_snapshots`에 전체/발전소/직무/발전소×직무 순위를 확정 보존한다.

---

## 5. RLS 및 개인정보

### admin
- 전체 발전소/담당자/시나리오/시즌 관리
- 감사로그 열람
- 포상용 실명 매핑은 관리자에게만 허용

### plant_manager
- 자기 발전소 사용자·초대 관리
- 참여/완료 현황 열람
- 개인 점수, 선택로그, 엔딩, 5대 지표 직접 조회 **금지**
- 집계는 `n < 5` 셀 억제

### player
- 본인 세션·본인 프로필
- 리더보드 공개뷰
- 본인 학습행동 프로필

RLS는 모든 개인정보 테이블에 활성화한다. `service_role`은 Supabase Edge Function에서만 사용한다.

---

## 6. 초대·로그인 플로우

```text
관리자/담당자
→ create-invite
→ 256-bit 임의 토큰 생성
→ DB에는 sha256(token)만 저장
→ /i/{token} 링크 생성
→ 카카오톡 공유 또는 링크 복사

사용자
→ /i/{token}
→ peek-invite
→ Kakao OAuth
→ 이름/닉네임/약관 확인
→ accept-invite
→ 1회성 토큰 원자적 소비
→ profile 생성/활성화
```

- 유효기간 7일
- 만료·취소·재사용 거부
- 타 발전소 active 계정의 자동 이동 금지
- 이동은 R2 승인 워크플로로 별도 처리
- 최초 admin은 수동 부트스트랩

### 6.1 카카오톡 공유 SDK

- 담당자 초대 공유는 카카오 JavaScript SDK의 `Kakao.Share.sendDefault()`를 우선 사용한다.
- SDK는 앱 초기 로드에 포함하지 않고 사용자가 공유 버튼을 누를 때 지연 로드한다.
- 현재 검증된 고정값: JavaScript SDK **2.8.2 + SRI**. 버전 업그레이드는 공식 Download 문서의 새 SRI와 함께 변경한다.
- `VITE_KAKAO_JS_KEY`는 Kakao Developers의 JavaScript 키이며 브라우저에서 사용하는 공개 플랫폼 키다. REST API 키·Admin 키 같은 비밀키는 절대 `VITE_*`로 노출하지 않는다.
- Kakao Developers에서 실제 서비스/프리뷰 도메인을 **JavaScript SDK domain**과 메시지 링크용 **Web domain**에 등록한다.
- SDK 키 누락·로드 실패·공유 실패 시 Web Share API → 클립보드 복사 순으로 graceful fallback한다.

---

## 7. 시나리오 JSON

### 필수 메타
```json
{
  "id": "s01_deadline",
  "version": 1,
  "title": "오늘 오전까지 끝내야 합니다",
  "defaultPerspectiveRole": "worker",
  "startNode": "intro",
  "cards": ["prejob_briefing", "peer_check", "three_way", "stop_when_unsure"],
  "nodes": {}
}
```

### 노드 타입
| type | 역할 |
|---|---|
| scene | 대사·상황 |
| decision | 3~4개 선택지 + 정보행동 + 카드 |
| hazard | 숨겨진 Hazard Engine 판정 |
| event | 이상징후 |
| ending | safe_complete / safe_stop / near_miss / event |

### 검증
- 모든 참조 노드 존재
- 도달 불가 노드 없음
- 모든 경로가 ending에 도달
- decision 3~4 선택지
- 모바일 텍스트 길이 제한
- 최소 1 hazard, 최소 3종 ending
- 한 선택지가 모든 지표에서 우월하면 정답편향 경고
- `action_id`는 표시 순서와 무관한 안정적 ID

---

## 8. 게임 엔진

### 상태
```ts
interface GameState {
  nodeId: string;
  clockMin: number;
  psf: Record<string, number>;
  barriers: Record<string, number>;
  metrics: Record<string, number>;
  flags: Record<string, boolean>;
  cardsUsed: string[];
  log: DecisionLog[];
  simulationRng: SeededRng;
}
```

### Hidden Hazard
```text
PSFWeight M = Π relevant PSF multiplier
Barrier B = 1 - Π(1 - barrier effectiveness)
HazardIndex = clamp(baseIndex × M × (1 - B), 0, 100)
```

이 값은 **교육용 상대지수**이며 실제 HRA/HEP/설비 위험확률이 아니다. 플레이 UI에는 절대 노출하지 않는다.

같은 시즌·같은 시나리오는 동일 `simulation_seed`를 사용하므로 같은 행동 로그는 같은 결과를 낸다. `presentation_seed`는 선택지 순서 등 UI 셔플에만 사용한다.

### 공개 API
```ts
createGame(scenario, opts)
getView(state)        // Hazard 수치 미포함
act(state, action)
isFinished(state)
evaluate(state)
replayFrom(log, simulationSeed, nodeId)
```

---

## 9. 점수 무결성

```text
start-session
→ 서버가 season/scenario version/simulation seed 확정
→ 클라이언트 플레이·행동로그 저장
→ submit-session
→ Edge에서 동일 @hero/engine으로 로그 재실행
→ ending/metrics/hp_point 서버 계산
→ DB 확정
```

클라이언트가 보낸 최종 점수는 신뢰하지 않는다.

시나리오 HP 최대 310:
- 완주 100
- 엔딩 최대 60
- 5대 학습행동 지표 평균 최대 100
- 인과 회고 최대 20
- 리플레이 개선 최대 30

`score_rule_version`을 세션마다 기록한다.

오프라인에서는 이미 시작된 세션만 진행 가능하며 완료 로그는 재접속 후 서버 검증을 거쳐 순위에 반영한다.

---

## 10. OPIS 콘텐츠 파이프라인 (R2)

```text
관리자 PDF 업로드
→ 텍스트 추출
→ 구조화 HF 분석
   timeline
   decisionPoints
   psf
   barriers
   organizationalConditions
   directCauses
   rootCauses
   contributingFactors
   causalChain
   failedBarriers
   correctiveActions
→ cause-evidence-corrective-action traceability check
→ 시나리오 JSON 초안
→ schema 검증
→ SAGE/GUARD 전문가 검토
→ 승인·배포
```

- 자동 대량 크롤링은 MVP/R2 범위에 두지 않는다.
- 인명·호기·고유 설비 Tag·세부 운전값은 익명화/일반화한다.
- “작업자 실수”만을 Root Cause로 제시하면 검토 실패.
- 조사기관이 명시한 사실/평가와 HERO의 Direct·Root·Contributing 분류를 구분한다.
- Root Cause/Contributing Factor 각각은 근거 구간과 관련 방어막·재발방지대책까지 추적 가능해야 한다.
- 보호계통의 정상 안전동작을 실패방어막으로 분류하지 않는다.
- Trip initiation cause와 post-event recovery HF issue를 별도 원인사슬로 관리한다.
- 최소한 PSF·절차·감독·설계·조직조건·방어막 관점을 함께 검토한다.

---

## 11. 프론트엔드

주요 라우트:
```text
/login
/i/:token
/
/play/:scenarioId
/review/:sessionId
/leaderboard
/me
/manager/*
/admin/*
```

- 관리자·Studio 코드는 lazy load
- 장별 이미지/오디오 lazy load
- 게임 진행상태는 IndexedDB 자동저장
- 새 세션 시작/로그인/최종점수 확정은 온라인 필수

---

## 12. 오디오 런타임·자산 계약

### 12.1 생성과 배포
BGM은 Google Flow Music의 **Lyria 3.5**를 우선 제작 도구로 사용한다. SFX/ambience/foley는 Google Flow 계열 도구 또는 별도 승인 도구를 사용할 수 있다.

AI 오디오는 **런타임 생성하지 않는다**.

```text
Audio brief
→ AI 생성 후보
→ LOOP 연출 검토
→ SAGE HF/경보혼동 검토
→ GUARD 권리·파일 QC
→ normalize/export
→ manifest 등록
→ public/audio 배포
```

### 12.2 디렉터리
```text
apps/web/public/audio/
├─ audio_manifest.json
├─ bgm/
└─ sfx/

assets/audio/
├─ prompts/
└─ reviews/
```

### 12.3 manifest 예
```json
{
  "version": "1.0",
  "assets": [
    {
      "id": "bgm_operation_base",
      "kind": "bgm",
      "file": "/audio/bgm/bgm_operation_base_v1.mp3",
      "loop": true,
      "defaultGain": 0.42,
      "sourceTool": "Google Flow Music",
      "model": "Lyria 3.5",
      "promptHash": "sha256:...",
      "generatedAt": "YYYY-MM-DD",
      "licenseReview": "approved",
      "hfAudioReview": "approved"
    }
  ]
}
```

### 12.4 AudioManager
- 최초 플레이에서 **소리 켜고 시작 / 무음으로 시작** 선택
- 사용자 제스처 전 `AudioContext` 시작 금지
- BGM/SFX mute·volume 독립 저장
- BGM 전환 400~800ms crossfade
- 대사/핵심 SFX 시 BGM ducking
- 동일 SFX 빠른 연속 재생 voice limit
- 재생 실패가 게임 상태에 영향을 주지 않음
- 필수 UI SFX만 precache, BGM은 장면별 lazy-load/cache
- 통화/백그라운드 전환 시 pause/resume 상태 정리

### 12.5 원전 HF 오디오 금지사항
- 실제 원전 경보음 샘플링 금지
- 경보·비상방송·설비 경고음과 유사한 반복 패턴 금지
- 핵심 정보를 소리만으로 전달 금지
- 사건 엔딩에 공포·재난형 사이렌 남용 금지
- SAGE + GUARD 승인 없는 오디오 배포 금지

---

## 13. 배포

| 환경 | Frontend | Backend |
|---|---|---|
| local | `pnpm dev` | `supabase start` |
| preview | Cloudflare Pages PR preview | Supabase staging |
| production | Cloudflare Pages main | Supabase production |

환경변수:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_KAKAO_JS_KEY`
- Edge secrets: `SUPABASE_SERVICE_ROLE_KEY`, `SITE_URL`, R2 LLM/Alimtalk keys

CI:
```text
lint → typecheck → unit test → scenario validation → build → E2E
```

---

## 14. 보안·감사

- RLS 전 테이블 활성화
- 초대 토큰 원문 DB 저장 금지
- 공개뷰에 실명 금지
- rate limit: 초대·세션 제출
- 핵심 운영행위 감사로그:
  - 초대 생성/취소/수락
  - 역할변경
  - 사용자 비활성화
  - 발전소 이동
  - 닉네임 강제변경
  - 점수조정
  - 시즌마감
- 탈퇴 후 개인식별 연결 익명화
- OPIS 원문은 비공개 Storage

---

## 15. 성능·접근성

- 모바일 LCP < 2.5s 목표
- 초기 번들에서 BGM 다운로드 제외
- 총 MVP 런타임 오디오 목표 15MB 이하
- 오디오 파일 immutable cache
- 모든 핵심 정보는 무음 상태에서도 동등하게 제공
- WCAG 2.2 AA 목표
- `prefers-reduced-motion` 및 reduced-sensory 지원

---

## 16. 테스트

| 레벨 | 테스트 |
|---|---|
| Unit | 엔진 결정론, 점수, breachChain, replay |
| Scenario | 전체 경로 도달성·정답편향 |
| RLS | admin/manager/player 권한 허용·거부 |
| E2E | 초대→로그인→플레이→결과→리더보드 |
| Offline | 진행 중 세션 이어하기·재접속 제출 |
| Audio | autoplay unlock, mute/volume, crossfade, iOS/Samsung Internet, 백그라운드 복귀 |
| HF Audio | 실제 경보음 혼동성 검토, mute 정보동등성 |
| Content | OPIS 익명화·시스템적 원인 검토 |
