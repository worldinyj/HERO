# HERO 튜토리얼 나레이션 제작 패키지 V1

작성일: 2026-10-11 (Asia/Seoul)

## 현재 상태와 범위

튜토리얼 `s00_tutorial` v1의 원문에서 추출한 제작 대본이다. 음성 파일 생성·청취 검수·운영 음원 등록은 아직 완료되지 않았다. 나레이션 전용 재생 채널·설정·장면 연결은 구현했다. 실제 파일이 승인 manifest에 등록되기 전에는 나레이션이 재생되지 않는다.

원본: `scenarios/data/S00_tutorial.json`. 기계 판독용 대본과 원본 SHA-256: `assets/audio/prompts/NARRATION_S00_V1.json`.

상황 설명, 선택 질문, 사용자가 열어 본 정보, 도달한 엔딩의 설명까지 총 5개 파일을 제작한다. 선택지·버튼·점수·장 제목은 이번 음성 범위에서 제외한다. 다른 경로의 엔딩이나 열지 않은 정보는 재생하지 않는다. S01~S03은 검토 초안으로 이번 제작 범위에 포함하지 않는다.

## 목소리 결정

**기본 보이스: Jin Geon Song - Neutral, Calm and Steady**

- ElevenLabs 검색어: `Jin Geon Song`
- 공개 목록에 기재된 voice_id: `BbsagRO6ohd8MKPS2Ob0`
- 언어/억양: 한국어 / Seoul (공개 한국어 보이스 목록 기준)
- 성별: 남성
- 합성 모델: **Eleven v4 (`eleven_v4`)**
- 용도: 튜토리얼 5개 파일 전체에 같은 보이스 사용

공개 보이스 설명은 따뜻하고 차분한 중저음의 한국어 나레이션이다. 이 설명을 기준으로 HERO의 절제된 기술 현장 분위기와 중립적인 훈련 안내에 맞는 기존 보이스로 선정했다. 새 Voice Design 보이스를 만드는 절차는 이번 작업에서 제외한다.

확인 범위: 2026-10-11 JSON2Video 공개 ElevenLabs 보이스 목록에서 이름·ID·설명을 확인했다. ElevenLabs 공식 라이브러리는 로그인 화면으로 연결되어 계정 내 현재 제공 여부와 v4 미리듣기는 확인하지 못했다. 이 선정은 설명에 근거하며 청취 평가를 완료했다는 뜻이 아니다. 생성 전 ElevenLabs에서 같은 이름/ID를 확인하고 아래 문구로 발음·톤을 점검한다.

- [보이스 이름·ID·성별 확인 자료](https://json2video.com/ai-voices/elevenlabs/voices/BbsagRO6ohd8MKPS2Ob0/)
- [한국어 보이스 목록·음색 설명](https://json2video.com/ai-voices/elevenlabs/languages/korean/)
- [ElevenLabs 보이스 라이브러리](https://elevenlabs.io/app/voice-library)

선택 질문과 양쪽 엔딩은 같은 중립적인 톤으로 읽는다. 위압적인 명령·과장된 긴장·공포·축하 연기로 특정 선택을 유도하지 않는다.

### 목소리 미리듣기용 문구

이 문구는 목소리 비교용이며 게임에 추가되는 새 대본이 아니다.

```text
현장에 도착했습니다. 작업대 앞에는 비슷하게 생긴 두 개의 대상이 있습니다. 작업 대상을 확신하기 어려운 상황입니다. 어떻게 하시겠습니까? 두 대상의 명칭은 비슷하지만 마지막 식별 문자가 다릅니다. 진행 직전 식별 차이를 발견했습니다. 한 번의 행동보다 여러 방어막의 상태를 함께 돌아봅니다.
```

## ElevenLabs 제작 순서

1. ElevenLabs Voice Library에서 `Jin Geon Song`을 검색하고 **Jin Geon Song - Neutral, Calm and Steady**를 선택한다. 이름이 유사한 보이스가 있으면 ID `BbsagRO6ohd8MKPS2Ob0`를 대조한다.
2. 해당 보이스를 My Voices에 추가한 뒤 위 미리듣기 문구로 한국어 발음과 중립적인 톤을 확인한다.
3. Text to Speech에서 해당 보이스와 **Eleven v4 (`eleven_v4`)**를 선택한다. 사전 제작 음원에 사용할 모델이다.
4. 아래 대본을 각각 별도 생성한다. 먼저 태그 없이 원문 그대로 생성한다. 발음·톤이 좋지 않으면 같은 목소리로 다시 생성하고 설정값을 기록한다.
5. 파일별 MP3, 44.1 kHz, 128 kbps를 제작 목표로 사용한다. 무음 구간이 과도하면 편집하고, 클리핑·문장 잘림·첨가된 음악/효과음이 없는지 확인한다.

v4 공식 안내에 따르면 Stability와 Similarity를 사용하며 Speed/Style 슬라이더와 SSML은 지원하지 않는다. 따라서 다른 모델의 Speed 값이나 `<break>` 태그를 복사하지 않는다. 속도와 쉼은 목소리 선택·문장부호·텍스트 구조로 조절하고, 원문의 의미를 바꾸지 않는다. 수치 기본값은 여기서 임의 확정하지 않으며 실제 사용값을 기록한다.

## 파일별 생성 대본

각 코드 블록의 한국어만 대본 입력 칸에 붙여 넣는다. 제목·파일명·발화 지시는 읽는 문구에 포함하지 않는다.

### NAR-S00-01 · 시작 장면

파일명: `nar_s00_intro_text_v1.mp3`

```text
현장에 도착했습니다. 작업대 앞에는 비슷하게 생긴 두 개의 대상이 있습니다.
```

### NAR-S00-02 · 선택 질문

파일명: `nar_s00_decision_identify_prompt_v1.mp3`

```text
작업 대상을 확신하기 어려운 상황입니다. 어떻게 하시겠습니까?
```

### NAR-S00-03 · 표식 정보 확인 후

파일명: `nar_s00_decision_identify_read_label_v1.mp3`

```text
두 대상의 명칭은 비슷하지만 마지막 식별 문자가 다릅니다.
```

### NAR-S00-04 · 확인 후 진행 엔딩

파일명: `nar_s00_safe_end_summary_v1.mp3`

```text
추가 확인에 시간을 사용했지만 작업 대상을 명확히 확인했습니다.
```

### NAR-S00-05 · 멈춰서 다시 확인 엔딩

파일명: `nar_s00_near_miss_end_summary_v1.mp3`

```text
진행 직전 식별 차이를 발견했습니다. 한 번의 행동보다 여러 방어막의 상태를 함께 돌아봅니다.
```

## 게임 연결 기준 — 구현 완료, 음원 등록 대기

- 튜토리얼 버전과 node/action ID로 음성을 연결한다. 문구나 시나리오 버전 변경 시 대본 일치 여부를 확인하고 다시 제작한다.
- 브라우저 오디오 사용 동의/사용자 제스처 이후 해당 장면에서만 한 번 재생한다. 선택 질문은 선택지보다 먼저 읽되 선택 조작을 막지 않는다.
- 정보 음성은 해당 정보가 표시될 때만 재생한다. 결과 음성은 실제 도달한 엔딩의 summary만 읽는다.
- 다음 장면 이동·재시작·페이지 이탈·음소거 시 기존 음성을 중단하며, 새 음성이 겹치지 않게 한다.
- 별도 나레이션 켜기/끄기·음량·다시 듣기를 제공하고, 음성이 없거나 로딩/재생 실패해도 텍스트와 선택 조작은 정상 동작하도록 한다.
- 나레이션 재생 중 BGM 볼륨을 낮추고 종료/중단 시 복구한다. 전체 보기와 다음 장면 이동의 기존 동작을 유지하고 음성 완료를 기다리도록 강제하지 않는다.
- `audio_manifest.json`은 narration kind와 원문 연결 정보를 지원한다. 음성을 SFX로 등록하지 않는다. 승인 음원은 아래 형식으로 연결한다.

## 생성·검수 기록

파일마다 source_tool, 합성 model, voice_name, 실제 voice_id, 원문 대본, 태그 포함 실제 입력, 설정값, 생성일, 후보 번호, 파일명, 문구 SHA-256, 이용조건 확인일, 발음/음량/모바일 재생 검수를 기록한다. 아직 생성되지 않은 파일을 approved로 표시하지 않는다.

- 훈련 안내·표식·식별·방어막 발음이 자연스럽고 읽기 누락/추가가 없는지 확인한다.
- 특정 선택을 정답처럼 유도하거나 엔딩을 개인 비난·공포·승리로 연기하지 않는지 확인한다.
- 5개 파일의 목소리와 체감 음량을 맞춘다. 게임용 파일에는 BGM과 효과음을 합성하지 않는다.
- Android Chrome/Samsung Internet과 iOS Safari에서 중단·재재생·음소거·백그라운드 복귀를 검증한다.

## 공식 자료

2026-10-11 확인. 제품 UI/모델은 변경될 수 있으므로 실제 생성 시 계정 화면도 확인한다.

- [Eleven v4 한국어 지원](https://elevenlabs.io/docs/ko/overview/capabilities/text-to-speech/eleven-v4)
- [Voice Design 제작 안내](https://elevenlabs.io/docs/eleven-creative/voices/voice-design)
- [Text to Speech 모델·설정 안내](https://elevenlabs.io/docs/eleven-creative/playground/text-to-speech)
- [문장부호·오디오 태그 사용 안내](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices)


## 음원 수령 후 등록 형식

실제 파일을 `apps/web/public/audio/narration/`에 넣고 아래 형식으로 `audio_manifest.json`의 assets에 등록한다. 예시는 제작 대기 상태이며, 검수 전 approved를 true로 바꾸지 않는다. 승인하려면 기존 필수 provenance(도구·모델·프롬프트 해시·생성일·권리/HF/기술 검수자)와 voiceId를 함께 기록해야 한다.

```json
{
  "id": "NAR-S00-01",
  "kind": "narration",
  "path": "/audio/narration/nar_s00_intro_text_v1.mp3",
  "approved": false,
  "loop": false,
  "preload": "none",
  "narration": {
    "scenarioId": "s00_tutorial",
    "scenarioVersion": 1,
    "nodeId": "intro",
    "field": "text",
    "text": "현장에 도착했습니다. 작업대 앞에는 비슷하게 생긴 두 개의 대상이 있습니다."
  }
}
```

정보 확인 음원에는 `field: "revealText"`와 `actionId: "read_label"`을 사용한다. 나머지 대응 정보는 기계 판독용 대본을 따른다. 등록 후 `pnpm check:audio-manifest`를 실행한다. 이 검사는 파일 존재·원문/버전 일치·출처 기록·voiceId를 확인하고 초안 시나리오에 대한 등록을 차단한다.

로컬 검증: 원문 5개 대조, 재생 수명주기/승인/버전/무음 회귀 단위 테스트, 모바일 390×844·360×800에서 재생 순서/정보 공개/엔딩 분기/다시 듣기/중단/무음 플레이/접근성 검증. 모바일 테스트는 가상 오디오로 수행했으며 실제 ElevenLabs 음질과 iOS Safari 재생은 음원 수령 후 검증한다.
