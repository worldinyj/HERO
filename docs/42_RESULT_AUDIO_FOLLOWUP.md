# 회고·엔딩 오디오 후속 작업 — 2026-10-12

## 이전 세션 및 현재 환경 검토

- 이전 대화 `개발 현황 스냅샷 확인`의 마지막 완료 작업은 PR #102: BGM 3개·SFX 5개 등록, 나레이션 포함 승인 13개, BGM 페이드 음량 오류 수정.
- 검토 시작 시 로컬·원격 main: `c8b1bbfbc47cc5e593d5748a2f9c764229248fa0`, 작업 파일 변경 없음.
- GitHub PR #97~102 병합 확인, 최신 main CI·DB·모바일 실행 3개 모두 success 확인.
- 운영 `https://hero-dnr.pages.dev`: 로그인 화면의 수리·KHNP 로고 확인, JS/CSS/오디오/화면 경로 37개가 기존 로컬 빌드와 byte 일치. HTTP·보안 헤더·SPA·PWA 34개 검사 PASS.
- GitHub open issue #76(콘텐츠 사람 검토), #77(실제 초대 체인), #78(과거 CI/DB 재검증) 확인. 현재 CI는 성공이나 이슈 본문 상세 조회가 GitHub 502로 실패하여 이슈를 변경하지 않았다.
- `ops/release-evidence.json`은 정식 v1.0 승인 기준으로 법무·실기기·사내망·파일럿 등이 pending. `audioPolicy=deferred`도 남아 있다. 기존 사이트 배포·13개 오디오 등록을 정식 출시 승인으로 간주하지 않는다. 원래 TASKLIST 진도율은 과거 감사 기준이며 최신 전체 완료율로 재계산하지 않았다.

## 구현

게임과 결과 회고는 `/play/:scenarioId`를 공유하므로 URL만 보는 기존 BGM 선택은 결과 화면에서도 BGM-03을 계속 재생했다. 튜토리얼·경쟁 GamePage가 실제 완료 상태에 따라 음악을 선택한다.

- 진행 중: BGM-03.
- 엔딩부터 인과 회고·Swiss Cheese·HP 리뷰까지: BGM-05. 미등록·미승인 상태에서는 작업 음악을 중단하고 조용히 회고한다.
- 리플레이: BGM-03으로 복귀. 화면 이탈·음소거 시 중단.
- `safe_complete`: 기존 SFX-10 도장음. `safe_stop`: BGM-06, `near_miss`: BGM-07, `event`: BGM-08. stinger 미등록·미승인 시 SFX-10으로 대체한다. 두 음원을 겹쳐 재생하지 않는다.
- 엔딩 화면을 벗어나면 AbortSignal로 진행 중 효과음과 대기 중 lookup/play도 취소한다.
- 브리핑 BGM-02·캠페인 BGM-01은 기존 경로 선택을 유지한다. 위험 누적 BGM-04와 기타 SFX 7개는 이번 범위 밖이다.

## 보정 후보 4개

원본 및 기존 등록 파일은 보존했다. 아래 사본은 공개 폴더에 없고 런타임 manifest에도 등록하지 않았다.

| ID | 용도 | 길이 | 보정 사본 |
|---|---|---:|---|
| BGM-05 | 회고 | 59.75초 | [회고 음악](../assets/audio/candidates/processed-v1/bgm_review_reflective_v1.mp3) |
| BGM-06 | 안전 정지 | 5.99초 | [안전 정지](../assets/audio/candidates/processed-v1/stinger_safe_stop_v1.mp3) |
| BGM-07 | 근접오류 | 5.99초 | [근접오류](../assets/audio/candidates/processed-v1/stinger_near_miss_v1.mp3) |
| BGM-08 | 사건 | 4.39초 | [사건](../assets/audio/candidates/processed-v1/stinger_event_v1.mp3) |

회고 BGM은 같은 소스의 30~90초 구간을 편집하고 0.25초 순환 crossfade 및 2-pass loudness 보정을 적용했다. 엔딩은 길이를 유지하며 sample peak 약 -8dBFS로 보정했다. 오디오 스트림만 내보내 embedded artwork는 제외했다.

생성 도구 Flow Music·사용 권한은 이전 사용자 대화에서 확인했다. 모델명은 미확인, 생성일은 원본 수정일의 한국 날짜 추정, prompt hash는 제작 요청 기준이다. 이번 보정본의 청취 결과는 아직 받지 않았으며 이전 8개에 대한 청취 확인을 승계하지 않는다.

검사: [RESULT_AUDIO_PROCESSED_QC.json](../assets/audio/reviews/RESULT_AUDIO_PROCESSED_QC.json). 등록 준비안: [RESULT_AUDIO_PENDING_MANIFEST.json](../assets/audio/reviews/RESULT_AUDIO_PENDING_MANIFEST.json), `approved=false`, HF 검토자 미기재.

## 검증

- 단위 테스트 379개: 엔진 19, 웹 360. 승인된 stinger 선택·미승인 fallback·unmount/대기 중 취소 회귀 포함.
- typecheck/lint/build, initial-load budget, route splitting, client secrets, social metadata, audio manifest(기존 승인 13개), diff whitespace PASS.
- `e2e/narration.spec.ts`: Chromium 390×844·360×800 총 20개 PASS. 기존 나레이션·13개 실제 MP3·mute 동작과 후속 단계 전환·fallback·리플레이·경쟁 플레이 검증.
- 4개 후보는 테스트 전용 응답 경로에서 실제 decodeAudioData 및 Audio.play/currentTime 진행을 확인. 운영 승인 manifest를 조작하지 않았다. 이벤트 전환 테스트는 합성 승인 fixture를 사용한다.
- 테스트 작성 중 버튼명과 reload 시 이벤트 초기화 가정을 바로잡았고, 경쟁 시나리오 전환 전 초기 BGM 요청 완료를 기다려 요청 경합으로 인한 검사 오판을 제거했다. 위 통과 수는 마지막 수정 후 실행 기준이다.
- FFmpeg 전체 디코딩·sample peak·SHA-256 PASS. Codex 독립 청취 및 iOS/Samsung/Kakao 인앱 실기기 검수는 수행하지 않았다.

## 다음 단계

사용자가 네 보정본의 음악 적합성·반복 경계·잡음·보컬·경보음 유사성을 청취 확인하면 HF 기록을 반영하고 공개 audio/bgm 및 승인 manifest에 등록한다. 이후 실제 등록 manifest로 모바일 재생 회귀를 실행하고 PR의 CI·미리보기·운영 배포를 확인한다. 이번 준비만으로 새 음원을 승인하거나 운영에 배포하지 않는다.
