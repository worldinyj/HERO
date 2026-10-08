# HERO — 검증된 영수증 기반 오프라인 복구 보강

> 2026-10-08 · 브랜치 `work/actions-paused-batch-20261008` · T5-03 PARTIAL

## 검토 결과
기존 로직에서 첫 온라인 직접 제출 시 아직 submission-queue 행이 없으면, 서버의 성공 영수증을 받고도 committed 행을 만들지 않았다. IndexedDB 삭제 또는 게임 캐시 정리 실패 후 재접속하면 확인된 완료 결과를 복구할 저장 기록이 부족했다.

또한 foreground 제출은 이전 `committed` 행의 영수증 존재 여부를 검사해 보존하지만, background flush는 영수증 유무와 관계없이 정리하여 구형 기록의 유일한 증거를 삭제할 수 있었다.

## 수정
- 신규 첫 제출의 서버 확인 응답에 대해서도 **큐 기록이 없다면 검증된 receipt가 포함된 committed 마커를 먼저 기록**한다. 완료 성공 후 로컬 정리 실패 시 이 마커를 보존한다.
- 이전 committed 마커가 검증된 receipt를 잃은 경우엔 올바른 영수증을 가진 경우에만 마커를 보강한다.
- background flush에서 committed 행의 영수증을 별도로 검증한다. 영수증 없음·세션 ID 불일치·비정상 응답은 서버 재전송과 자동 삭제 모두 차단한다.
- 새 Vitest 6건 추가: 마커의 영수증 검증 3건, 첫 직접 제출 정리 실패, 구형 마커 보존, 잘못된 영수증 보존 3건.

## 검증 수준 / 릴리스 게이트
- 코드 변경 및 새 테스트 작성. 전체 Vitest·실제 IndexedDB·Playwright·pgTAP·모바일 실기기는 **NOT RUN**.
- 이 저장소는 현재 원격 GitHub 연결을 통해 수정 중이며, 컨테이너에서 npm registry DNS 및 사설 GitHub DNS가 차단되어 전체 모노레포 설치/테스트를 실행할 수 없었다.
- 영수증 마커와 정리 삭제가 모두 로컬 저장소 장애로 실패하면 pending 기록이 남을 수 있다. 최종 안전성은 서버 원자 완료 RPC의 멱등성 실검증에 달려 있다.
- 기존 Tasklist 75.6%, T5-03 PARTIAL 유지. Actions/main/PR #79/Supabase 배포/Cloudflare 불변.
