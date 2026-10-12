# HERO Audio Review Log

배포 대상 오디오는 아래 검수표를 모두 통과한 뒤 `apps/web/public/audio/audio_manifest.json`에 등록한다.

| Asset ID | Candidate | File | Tool/Model | LOOP | SAGE HF | Rights | Technical | Final |
|---|---|---|---|---|---|---|---|---|
| _example_ | 1 | _not committed_ | _tool/model_ | PENDING | PENDING | PENDING | PENDING | PENDING |

## LOOP
- 장면의 목적과 템포에 적합
- 대사/선택 UX를 방해하지 않음
- 반복 청취 시 피로가 과하지 않음

## SAGE Human Factors Audio
- 실제 원전 경보·설비 경고·비상방송과 혼동되지 않음
- 인지부하를 과도하게 높이지 않음
- 소리가 특정 선택을 '정답'처럼 유도하지 않음
- 사건 엔딩을 개인 비난·공포 연출로 과장하지 않음

## Rights / Provenance
- 생성 서비스와 모델 기록
- 정확한 프롬프트 또는 프롬프트 해시 기록
- 생성일 기록
- 배포 시점의 이용조건/권리 검토 기록
- AI 생성 출처 표시(SynthID 등)가 제공되는 경우 훼손하지 않음

## Technical
- clipping 없음
- loop point 청취 확인
- 모바일 Safari / Chrome / Samsung Internet 재생
- mute/volume 정상
- 백그라운드/통화 복귀 시 상태 정상
- 무음 상태에서도 정보 손실 없음

## S00 나레이션 — 2026-10-11

사용자가 Jin Geon Song / Eleven v4 생성, 사용 권한, 대본·발음·톤 청취 검수를 대화에서 확인했다. Codex는 독립적인 청취 검수를 수행하지 않았다. 원본 오디오 바이트를 그대로 보존하여 `/audio/narration/`에 등록했다.

| Asset ID | File | Rights / HF | Technical | Final |
|---|---|---|---|---|
| NAR-S00-01 | nar_s00_intro_text_v1.mp3 | 사용자 확인 | 44.1kHz · mono · 128kbps, 전체 디코딩 PASS | 등록 |
| NAR-S00-02 | nar_s00_decision_identify_prompt_v1.mp3 | 사용자 확인 | 44.1kHz · mono · 128kbps, 전체 디코딩 PASS | 등록 |
| NAR-S00-03 | nar_s00_decision_identify_read_label_v1.mp3 | 사용자 확인 | 44.1kHz · mono · 128kbps, 전체 디코딩 PASS | 등록 |
| NAR-S00-04 | nar_s00_safe_end_summary_v1.mp3 | 사용자 확인 | 44.1kHz · mono · 128kbps, 전체 디코딩 PASS | 등록 |
| NAR-S00-05 | nar_s00_near_miss_end_summary_v1.mp3 | 사용자 확인 | 44.1kHz · mono · 128kbps, 전체 디코딩 PASS | 등록 |

파일 SHA-256·길이·측정 sample peak는 `NARRATION_S00_TECHNICAL_QC.json` 참조. 전 파일 sample peak는 -1.2~-3.7dBFS이며, 이것은 true peak·원본 합성 단계 clipping 여부를 보증하는 측정은 아니다. 생성일은 로컬 파일 수정일에서 추정한 2026-10-11이며 정확한 합성 시각은 미확인이다. promptHash는 문서화된 plain-text 대본의 UTF-8 SHA-256이다. 실제 생성 화면의 설정·추가 태그는 별도 보관되지 않았다.

Chromium 모바일 viewport 재생·디코딩을 자동 검증한다. iOS Safari·Samsung Internet 실기기, 통화 복귀와 현장 인지부하 평가는 아직 별도 확인 대상이다. BGM·SFX는 이번 등록에 포함되지 않는다.

## BGM·SFX 우선 8개 — 2026-10-12

사용자가 생성 도구 Flow Music, 앱 사용 권한, 보정본 청취 확인(반복 경계·잡음·보컬·경보음 유사성)을 대화에서 확인했다. 모델명은 사용자가 모른다고 답하여 `unknown_user_does_not_know`로 기록한다. 실제 모델·합성 시각·입력 프롬프트를 추정해서 확정하지 않는다. 생성일은 파일 수정일의 한국 날짜 추정, 프롬프트 해시는 제작 요청 원문 기준이다.

- 등록: BGM-01/02/03, SFX-02/04/05/07/10. 나레이션 5개와 함께 총 13개.
- 원본 20개 보존. 보정 사본은 `assets/audio/candidates/processed-v1/`, 앱 사본은 공개 audio/bgm·sfx 아래에 저장한다.
- BGM은 같은 트랙의 30초 이후 구간을 약 45·60초로 편집하고 0.25초 순환 crossfade·2-pass loudness 보정을 적용했다. MP3/native loop의 실제 실기기 무간격 반복을 보장하지 않는다.
- SFX는 약 -8dBFS sample peak로 보정. HU Tool 증폭에 따른 잡음 여부는 사용자 청취 확인에 의존한다.
- 원본 20개·보정 8개 SHA-256, FFmpeg 전체 디코딩·sample peak, Chromium native decode/play 진행 확인. Codex 독립 청취·실기기 검수 없음.
- 상세: `BGM_SFX_V1_CANDIDATE_TECHNICAL_QC.json`, `BGM_SFX_FIRST_BATCH_PROCESSED_QC.json`.
- 나머지 12개는 미등록·미연결. 짧은 SFX-08 등 다음 배치 보완 항목을 유지한다.
