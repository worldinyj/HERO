# HERO — Audio Asset Guide

| 항목 | 내용 |
|---|---|
| 문서 버전 | **v1.0 / HERO docs v1.3** |
| 작성일 | 2026-10-07 |
| 목적 | HERO의 BGM·SFX를 일관되게 생성, 검수, 파일화, 배포하는 제작 계약 |

---

## 1. 제작 도구 기준

2026-10 기준 과거 MusicFX 계열은 **Google Flow Music / Lyria** 흐름으로 발전해 있다. HERO는 다음 우선순위를 사용한다.

1. **BGM / musical stinger**: Google Flow Music 또는 Gemini/AI Studio의 Lyria 3.5
2. **SFX / ambience / foley**: Google Flow의 오디오/foley 생성 도구가 적합할 경우 사용하고, 기능이 부족하면 상업 이용이 허용된 별도 생성 도구 사용
3. 생성 도구는 어디까지나 **제작 단계**에서만 사용한다. 게임 런타임에서 AI 오디오를 실시간 생성하지 않는다.

> 생성 당시 서비스 약관과 상업적 이용조건을 반드시 다시 확인한다. 생성 출처·모델·프롬프트·검수결과를 manifest/review에 기록한다.

---

## 2. 사운드 콘셉트

HERO의 사운드는 “전술적이지만 과장되지 않은 기술 현장”을 목표로 한다.

- **캠페인**: 차분한 전략/임무 준비, 70~95 BPM
- **브리핑**: 낮은 긴장감, 공간감은 있으나 음성·텍스트 집중 방해 금지
- **작업**: 일정한 pulse, 과도한 드럼/베이스 금지
- **긴장 상승**: 템포 증가보다 레이어·질감 변화 중심; 사이렌·알람 패턴 금지
- **리뷰**: 반성적·중립적, 실패/비난 정서보다 학습·회복 느낌
- **엔딩**: 2~8초 stinger, 사건발생도 공포/재난음 대신 절제된 마감

**금지**: 실제 원전 경보음 샘플, MCR 경고음 모사, 비상방송 효과, 장시간 반복 ticking, 갑작스러운 고음 peak, 보컬 가사로 판단을 유도하는 요소.

---

## 3. MVP 큐 시트

### BGM
| ID | 파일명 | 용도 | 길이/루프 | 생성 방향 |
|---|---|---|---|---|
| BGM-01 | `bgm_campaign_map_v1.mp3` | 홈/캠페인 맵 | 45~90s loop | calm tactical, restrained, instrumental |
| BGM-02 | `bgm_briefing_v1.mp3` | 출진/상황 브리핑 | 30~60s loop | technical anticipation, sparse |
| BGM-03 | `bgm_operation_base_v1.mp3` | 일반 작업 진행 | 45~90s loop | focused industrial-adjacent pulse, no alarms |
| BGM-04 | `bgm_operation_tension_v1.mp3` | 위험 누적 장면 | 30~60s loop | subtle tension layers, no sirens |
| BGM-05 | `bgm_review_reflective_v1.mp3` | HP/Swiss Cheese 리뷰 | 45~90s loop | reflective, neutral, hopeful |
| BGM-06 | `stinger_safe_stop_v1.mp3` | 안전 정지 | 3~6s | affirmative but restrained |
| BGM-07 | `stinger_near_miss_v1.mp3` | 근접오류 | 3~6s | brief suspended resolution |
| BGM-08 | `stinger_event_v1.mp3` | 사건 발생 | 3~6s | sober, non-cinematic disaster tone |

### SFX
| ID | 파일명 | 용도 |
|---|---|---|
| SFX-01 | `sfx_ui_tap_v1.mp3` | 일반 버튼 탭 |
| SFX-02 | `sfx_choice_confirm_v1.mp3` | 선택 확정 |
| SFX-03 | `sfx_card_draw_v1.mp3` | 카드 노출 |
| SFX-04 | `sfx_card_use_v1.mp3` | HU Tool 사용 |
| SFX-05 | `sfx_info_open_v1.mp3` | 절차/정보 확인 |
| SFX-06 | `sfx_time_advance_v1.mp3` | 시간 진행 |
| SFX-07 | `sfx_event_attention_v1.mp3` | 이상징후 주의 — **추상 UI tone** |
| SFX-08 | `sfx_barrier_weaken_v1.mp3` | 방어막 약화 |
| SFX-09 | `sfx_barrier_reinforce_v1.mp3` | 방어막 강화 |
| SFX-10 | `sfx_stamp_result_v1.mp3` | 결과 도장 |
| SFX-11 | `sfx_rank_update_v1.mp3` | 순위 갱신 |
| SFX-12 | `sfx_unlock_chapter_v1.mp3` | 장 해금 |

---

## 4. 프롬프트 템플릿

### BGM 공통
`Instrumental only. Mobile game background music for a nuclear human-performance training simulation. [SCENE]. Restrained tactical mood, clear midrange for text/dialogue readability, no vocals, no sirens, no alarms, no emergency broadcast tones, no imitation of industrial warning signals. Seamless-loop-friendly ending, moderate dynamics, no sudden peaks.`

### 예: 작업 기본 BGM
`Instrumental only. Focused technical workplace tension, subtle electronic pulse and muted percussion, 82 BPM, calm but alert, sparse arrangement, designed to loop under dialogue. No vocals, no sirens, no alarms, no emergency tones, no cinematic explosion. 60 seconds.`

### SFX 공통
`Short abstract UI sound effect for a training game: [ACTION]. 0.3–1.2 seconds, soft transient, non-alarming, no siren, no bell pattern associated with real equipment, no voice, no realistic industrial alarm.`

---

## 5. 파일·품질 규격

- 런타임: MP3, 44.1/48kHz, stereo(BGM) / mono 또는 stereo(SFX), 과도한 bitrate 금지
- BGM 목표: 128~192 kbps, loop point 청취 QC
- SFX 목표: 96~160 kbps, 0.1~2.5s 중심
- normalization: 디지털 clipping 금지, 후보 간 체감 loudness 일관성 유지
- 파일명: `kind_purpose_vN.mp3`, 영문 소문자 snake_case
- 같은 asset을 교체해도 파일명 version을 올리고 manifest version을 갱신
- 삭제 대신 deprecated 표시 후 시나리오 참조를 먼저 제거

---

## 6. 저장소 구조

```text
HERO/
├─ apps/web/public/audio/
│  ├─ audio_manifest.json
│  ├─ bgm/
│  └─ sfx/
├─ assets/audio/
│  ├─ prompts/
│  │  └─ AUDIO_PROMPTS_V1.md
│  └─ reviews/
│     └─ AUDIO_REVIEW_LOG.md
└─ docs/06_AUDIO_ASSET_GUIDE.md
```

---

### 6.1 런타임 manifest 필드

승인된 파일을 `apps/web/public/audio`에 넣을 때 `audio_manifest.json`의 `assets`에 다음 런타임 필드를 추가한다.

| 필드 | 예 | 설명 |
|---|---|---|
| `id` | `BGM-01` | 큐 시트의 안정 ID |
| `kind` | `bgm` / `sfx` / `stinger` | 재생 종류 |
| `path` | `/audio/bgm/bgm_campaign_map_v1.mp3` | same-origin 배포 경로 |
| `approved` | `true` | HF·권리·기술 QC를 모두 통과한 경우에만 true |
| `loop` | `true` | BGM 반복 여부 |
| `defaultVolume` | `0.8` | 0~1 asset 보정값 |
| `preload` | `essential` / `scene` / `none` | 초기 캐시 정책 |
| `provenance` | object | 승인 자산의 tool/model/promptHash/생성일/권리·HF·기술 검토자 |

런타임은 `approved=true`이면서 `/audio/` 아래 same-origin 경로인 asset만 재생한다. 승인 asset은 실제 파일과 provenance가 모두 있어야 `pnpm check:audio-manifest`를 통과한다.

`preload=essential`은 UI/선택 확정처럼 짧고 반복 사용되는 **승인 SFX에만** 사용한다. BGM은 최초 LCP 시 다운로드하지 않고 해당 장면에서 처음 요청될 때 lazy-load한다.

예시:

```json
{
  "id": "SFX-02",
  "kind": "sfx",
  "path": "/audio/sfx/sfx_choice_confirm_v1.mp3",
  "approved": true,
  "defaultVolume": 0.8,
  "preload": "essential",
  "provenance": {
    "tool": "Google Flow",
    "model": "사용한 모델명",
    "promptHash": "sha256:...",
    "generatedAt": "YYYY-MM-DD",
    "licenseReviewedBy": "검토자",
    "hfReviewedBy": "검토자",
    "technicalReviewedBy": "검토자"
  }
}
```

## 7. 검수 게이트

각 asset은 배포 전 아래를 모두 PASS 해야 한다.

- LOOP: 장면·게임 템포 적합성
- STORY: 대사/연출 충돌 없음
- SAGE: 인지부하 과다 없음, 실제 원전 경보·설비음과 혼동 가능성 없음
- GUARD: 파일 재생/loop/peak/모바일 호환, 생성 도구·약관·provenance 기록 완료
- 접근성: mute 상태에서도 의미 손실 없음

승인되지 않은 후보 파일은 `apps/web/public/audio`에 넣지 않는다.
