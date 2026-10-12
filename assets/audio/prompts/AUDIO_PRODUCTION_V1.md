# HERO BGM·효과음 제작 패키지 V1

작성일: 2026-10-11 (Asia/Seoul)

2026-10-12 사용자 제작 후보 20개를 확인했고, 우선 연결된 8개를 보정·검수 후 등록했다. 후속 회고·엔딩 4개도 사용자 보정본 청취 확인 후 등록했다. 남은 8개는 원본 후보로 보관한다. 아래 프롬프트는 기존 `AUDIO_PROMPTS_V1.md`를 완전한 복사용 문장으로 정리한 제작 요청이다. 생성 도구가 요청한 길이·루프·비음악 효과음을 그대로 지원한다는 보장은 아니므로 결과를 검수한다. 현재 승인 manifest는 나레이션 5개·BGM 4개·SFX 5개·엔딩 stinger 3개로 총 17개이다.

## 먼저 제작할 8개

현재 앱의 재생 이벤트에 연결되어 있어 검수 후 등록하면 사용할 수 있는 큐다. 후속 변경에서 회고 BGM·엔딩 stinger 4개를 연결·등록했다. 나머지 8개는 추가 이벤트 연결이 필요하다.

| 순서 | ID | 목적 | 파일명 |
|---|---|---|---|
| 1 | BGM-03 | 튜토리얼·경쟁 게임 | `bgm_operation_base_v1.mp3` |
| 2 | BGM-02 | 튜토리얼·경쟁 브리핑 | `bgm_briefing_v1.mp3` |
| 3 | BGM-01 | 캠페인 홈 | `bgm_campaign_map_v1.mp3` |
| 4 | SFX-02 | 선택 확정 | `sfx_choice_confirm_v1.mp3` |
| 5 | SFX-05 | 선택 화면 정보 열기 | `sfx_info_open_v1.mp3` |
| 6 | SFX-04 | 방어 카드 사용 | `sfx_card_use_v1.mp3` |
| 7 | SFX-07 | 상황 변화 화면 | `sfx_event_attention_v1.mp3` |
| 8 | SFX-10 | 도달한 엔딩 결과 도장 | `sfx_stamp_result_v1.mp3` |

## 제작·검수·전달

1. BGM은 Google Flow Music에서 아래 전체 프롬프트로 후보를 만든다. SFX는 짧은 비음악 효과음 생성이 가능한 도구를 사용한다. 실제 사용한 서비스·모델 이름을 기록한다.
2. 가능하면 각 큐 후보 2개를 비교한다. BGM은 최소 두 번 이어 듣고 루프 경계의 튀는 소리·갑작스러운 음량 변화를 확인한다.
3. 나레이션과 함께 들으며 말이 묻히지 않는지, 경보·비상방송과 혼동되지 않는지, 특정 선택을 정답처럼 유도하지 않는지 확인한다.
4. 파일은 아래 이름으로 저장하고, 검수 전에는 `assets/audio/candidates/`에 둔다. 이 폴더는 앱 공개 배포에 포함되지 않는다.
5. 생성 도구·모델·실제 입력 프롬프트·생성일·사용 권한 확인·청취 결과를 함께 전달한다. 프롬프트를 수정했다면 수정본을 기록한다. 기계 판독 패키지의 해시는 아래 요청 원문 기준이다.
6. 검수 후 파일을 `apps/web/public/audio/bgm/` 또는 `sfx/`에 옮기고 승인 manifest에 등록한다. 없는 음원이나 검수 전 후보를 승인하지 않는다.

MP3 44.1/48kHz, BGM 128~192kbps, SFX 96~160kbps를 기준으로 한다. 별도 생성 음원을 임의로 잘라 붙이거나 워터마크를 제거하지 않는다. 이미 배포된 음원을 바꾸면 파일명 버전을 올린다.

## 복사용 전체 프롬프트

### BGM-03 — 작업

파일명: `bgm_operation_base_v1.mp3` · 연결: 현재 연결됨

```text
Instrumental only. Mobile game background music for a nuclear human-performance training simulation. Restrained tactical mood, clear midrange for text/dialogue readability, no vocals, no sirens, no alarms, no emergency broadcast tones, no imitation of industrial warning signals, moderate dynamics, no sudden peaks.

Focused technical workplace tension. Subtle electronic pulse and muted percussion, 82 BPM, calm but alert, sparse arrangement, designed to loop under dialogue, 60–90 seconds.
```

### BGM-02 — 브리핑

파일명: `bgm_briefing_v1.mp3` · 연결: 현재 연결됨

```text
Instrumental only. Mobile game background music for a nuclear human-performance training simulation. Restrained tactical mood, clear midrange for text/dialogue readability, no vocals, no sirens, no alarms, no emergency broadcast tones, no imitation of industrial warning signals, moderate dynamics, no sudden peaks.

Technical anticipation before a maintenance task. Sparse instrumentation, 76 BPM, low cognitive load, neutral tension, seamless-loop-friendly, 45–60 seconds.
```

### BGM-01 — 캠페인

파일명: `bgm_campaign_map_v1.mp3` · 연결: 현재 연결됨

```text
Instrumental only. Mobile game background music for a nuclear human-performance training simulation. Restrained tactical mood, clear midrange for text/dialogue readability, no vocals, no sirens, no alarms, no emergency broadcast tones, no imitation of industrial warning signals, moderate dynamics, no sudden peaks.

Calm strategic mission-preparation background. 82 BPM, restrained hybrid acoustic/electronic texture, subtle pulse, confident but not heroic, seamless-loop-friendly, 60–90 seconds.
```

### SFX-02 — 선택 확정

파일명: `sfx_choice_confirm_v1.mp3` · 연결: 현재 연결됨

```text
Short abstract UI sound effect for a training game. Soft transient, non-alarming, no siren, no bell pattern associated with real equipment, no voice, no realistic industrial alarm.

0.25–0.5 s, neutral confirmation.
```

### SFX-05 — 정보 확인

파일명: `sfx_info_open_v1.mp3` · 연결: 현재 연결됨

```text
Short abstract UI sound effect for a training game. Soft transient, non-alarming, no siren, no bell pattern associated with real equipment, no voice, no realistic industrial alarm.

0.2–0.5 s, subtle document reveal.
```

### SFX-04 — HU Tool 사용

파일명: `sfx_card_use_v1.mp3` · 연결: 현재 연결됨

```text
Short abstract UI sound effect for a training game. Soft transient, non-alarming, no siren, no bell pattern associated with real equipment, no voice, no realistic industrial alarm.

0.4–0.9 s, restrained protective shimmer, no fantasy explosion.
```

### SFX-07 — 상황 변화

파일명: `sfx_event_attention_v1.mp3` · 연결: 현재 연결됨

```text
Short abstract UI sound effect for a training game. Soft transient, non-alarming, no siren, no bell pattern associated with real equipment, no voice, no realistic industrial alarm.

0.3–0.8 s, abstract attention cue; explicitly not alarm-like.
```

### SFX-10 — 결과 도장

파일명: `sfx_stamp_result_v1.mp3` · 연결: 현재 연결됨

```text
Short abstract UI sound effect for a training game. Soft transient, non-alarming, no siren, no bell pattern associated with real equipment, no voice, no realistic industrial alarm.

0.3–0.7 s, soft physical/digital stamp.
```

### BGM-04 — 긴장

파일명: `bgm_operation_tension_v1.mp3` · 연결: 추가 연결 필요

```text
Instrumental only. Mobile game background music for a nuclear human-performance training simulation. Restrained tactical mood, clear midrange for text/dialogue readability, no vocals, no sirens, no alarms, no emergency broadcast tones, no imitation of industrial warning signals, moderate dynamics, no sudden peaks.

Subtle escalation without alarm language. Add texture and harmonic tension rather than sirens or sharp rhythmic warning patterns. 84–92 BPM, seamless-loop-friendly, 45–60 seconds.
```

### BGM-05 — 리뷰

파일명: `bgm_review_reflective_v1.mp3` · 연결: 연결·등록 완료 (2026-10-12 사용자 보정본 청취 확인)

```text
Instrumental only. Mobile game background music for a nuclear human-performance training simulation. Restrained tactical mood, clear midrange for text/dialogue readability, no vocals, no sirens, no alarms, no emergency broadcast tones, no imitation of industrial warning signals, moderate dynamics, no sudden peaks.

Reflective and neutral post-scenario music. Gentle resolution, learning-and-recovery tone, not sad or triumphant, seamless-loop-friendly, 60–90 seconds.
```

### BGM-06 — 안전 정지

파일명: `stinger_safe_stop_v1.mp3` · 연결: 연결·등록 완료 (2026-10-12 사용자 보정본 청취 확인)

```text
Instrumental only. Mobile game background music for a nuclear human-performance training simulation. Restrained tactical mood, clear midrange for text/dialogue readability, no vocals, no sirens, no alarms, no emergency broadcast tones, no imitation of industrial warning signals, moderate dynamics, no sudden peaks.

Affirmative but restrained, neutral closure after a safe stop, 3–6 seconds. One-shot, no loop.
```

### BGM-07 — 근접오류

파일명: `stinger_near_miss_v1.mp3` · 연결: 연결·등록 완료 (2026-10-12 사용자 보정본 청취 확인)

```text
Instrumental only. Mobile game background music for a nuclear human-performance training simulation. Restrained tactical mood, clear midrange for text/dialogue readability, no vocals, no sirens, no alarms, no emergency broadcast tones, no imitation of industrial warning signals, moderate dynamics, no sudden peaks.

Brief suspended resolution after a near miss, 3–6 seconds. Neutral and reflective, no blame or horror. One-shot, no loop.
```

### BGM-08 — 사건

파일명: `stinger_event_v1.mp3` · 연결: 연결·등록 완료 (2026-10-12 사용자 보정본 청취 확인)

```text
Instrumental only. Mobile game background music for a nuclear human-performance training simulation. Restrained tactical mood, clear midrange for text/dialogue readability, no vocals, no sirens, no alarms, no emergency broadcast tones, no imitation of industrial warning signals, moderate dynamics, no sudden peaks.

Sober, neutral closure after an event, no disaster/cinematic alarm language, 3–6 seconds. One-shot, no loop.
```

### SFX-01 — 일반 탭

파일명: `sfx_ui_tap_v1.mp3` · 연결: 추가 연결 필요

```text
Short abstract UI sound effect for a training game. Soft transient, non-alarming, no siren, no bell pattern associated with real equipment, no voice, no realistic industrial alarm.

0.15–0.3 s, soft tactile digital tick.
```

### SFX-03 — 카드 노출

파일명: `sfx_card_draw_v1.mp3` · 연결: 추가 연결 필요

```text
Short abstract UI sound effect for a training game. Soft transient, non-alarming, no siren, no bell pattern associated with real equipment, no voice, no realistic industrial alarm.

0.3–0.8 s, light paper/digital swipe hybrid.
```

### SFX-06 — 시간 진행

파일명: `sfx_time_advance_v1.mp3` · 연결: 추가 연결 필요

```text
Short abstract UI sound effect for a training game. Soft transient, non-alarming, no siren, no bell pattern associated with real equipment, no voice, no realistic industrial alarm.

0.2–0.6 s, single movement cue; no repeated clock ticking.
```

### SFX-08 — 방어막 약화

파일명: `sfx_barrier_weaken_v1.mp3` · 연결: 추가 연결 필요

```text
Short abstract UI sound effect for a training game. Soft transient, non-alarming, no siren, no bell pattern associated with real equipment, no voice, no realistic industrial alarm.

0.4–0.8 s, muted tonal descent.
```

### SFX-09 — 방어막 강화

파일명: `sfx_barrier_reinforce_v1.mp3` · 연결: 추가 연결 필요

```text
Short abstract UI sound effect for a training game. Soft transient, non-alarming, no siren, no bell pattern associated with real equipment, no voice, no realistic industrial alarm.

0.4–0.8 s, muted tonal resolve.
```

### SFX-11 — 순위 갱신

파일명: `sfx_rank_update_v1.mp3` · 연결: 추가 연결 필요

```text
Short abstract UI sound effect for a training game. Soft transient, non-alarming, no siren, no bell pattern associated with real equipment, no voice, no realistic industrial alarm.

0.3–0.6 s, restrained progress cue.
```

### SFX-12 — 장 해금

파일명: `sfx_unlock_chapter_v1.mp3` · 연결: 추가 연결 필요

```text
Short abstract UI sound effect for a training game. Soft transient, non-alarming, no siren, no bell pattern associated with real equipment, no voice, no realistic industrial alarm.

0.5–1.0 s, short neutral-open cue.
```

기계 판독 파일: `AUDIO_PRODUCTION_V1.json`. 음원 등록·검수 기준: `docs/06_AUDIO_ASSET_GUIDE.md`.
