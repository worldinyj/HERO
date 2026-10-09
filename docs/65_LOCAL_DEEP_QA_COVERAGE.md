# HERO — Actions 없이 로컬 품질범위 확장

2026-10-08 · branch `work/actions-paused-batch-20261008`

## 문제

`qa --with-db`는 lint, tsc, 기본 테스트, 빌드, 두 탭 IndexedDB 동시 제출 Playwright(모바일 390×844), 로컬 pgTAP 417건을 실행한다. 하지만 CI에 정의된 시나리오 출처/원인 추적성·승격·법무·릴리스 준비도/오디오·번들 보안 검사와 Edge Deno 실행은 포함하지 않아, QA PASS를 전체 release readiness로 오해할 수 있었다.

## 구현

- `qaSteps`를 부작용 없는 단계 생성 함수로 분리해 옵션별 검사 구성을 단위 테스트한다.
- `qa --deep`은 로컬 읽기 전용 출처·인과·사람 검토·법무·오디오·MVP/배포 readiness 검사 및 번들 보안 검사를 추가한다. 승인 적용/배포/원격 쓰기는 없다.
- `qa --with-deno`는 Deno CLI가 있을 때 Edge Functions 9개 타입 체크 및 공유 유틸리티 단위테스트 파일 7개를 실행한다. 별도 opt-in.
- `QA_SCOPE`는 `deep` 및 `deno` 실행 여부와 전체 모바일 fixture 플로우 **NOT_RUN** 상태를 구분한다.
- 기존 24시간·SHA·env/build 해시의 Preview 근거 조건은 유지한다. 실패한 QA 근거는 즉시 무효화하고 새 성공 후만 저장한다.

## 범위 제외 및 향후

- 인증 초대 전체 360px/390px E2E에는 `supabase functions serve`, 임시 credential, `pnpm e2e:setup`이 필요하며 자동 실행하지 않는다. 해당 setup은 로컬에 데이터를 생성하므로 별도 명시적 fixture 허가·격리가 필요하다.
- Deno 검사/전체 Playwright/외부 staging은 아직 새 SHA에서 실행하지 않았다.
- 기존 두 원격 DB, Cloudflare, GitHub Actions, `main`, PR #79는 변경하지 않았다.

Mac에서:

```bash
git pull --ff-only origin work/actions-paused-batch-20261008
node --test scripts/hero-local.test.mjs
node scripts/hero-local.mjs qa --deep --with-db
```

## 2026-10-08 Mac Deno QA 실행 증거와 생성 파일

사용자가 Mac에서 실행한 `qa --deep --with-deno --with-db`는 아래 단계를 모두 통과했다.

- Edge `deno check` 9개 성공
- Edge `deno test` 7개 파일, 개별 테스트 22개 성공
- 게임 엔진 19개·웹 Vitest 300개·Chromium IndexedDB 7개 성공
- 로컬 PostgreSQL pgTAP 17개 파일, 417개 성공
- 시나리오·원인추적·법무 차단기·비밀키 및 코드분할 검사 정상 실행

그러나 종료 시 `checkClean()`가 Deno CLI가 새로 생성한 로컬 `deno.lock` **3개**를 `??` 미추적 파일로 인식해 `LOCAL_QA_PASS` 출력 전에 중단했다. 해당 실행은 **전체 QA PASS로 기록하지 않는다**.

정확히 다음 경로만 `.gitignore`에 추가했다.

```text
/supabase/functions/deno.lock
/supabase/functions/submit-session/deno.lock
/supabase/functions/admin-scenario/deno.lock
```

실제 로컬 파일은 삭제하지 않고, Deno 재실행 때 같은 생성물이 생겨도 Git clean 검사가 false positive를 내지 않게 한다. 노드 테스트는 위 3개만 무시하며 다른 `deno.lock` 경로를 숨기지 않는지 확인한다. 이 결정은 **현재 로컬 QA 출력에 대한 임시 정책**이다. 장기적으로 Deno 의존성 재현성이 필요하면 잠금파일을 검토·정상 버전관리하는 변경을 별도로 수행한다.

새 SHA에서 다시 `node scripts/hero-local.mjs qa --deep --with-deno --with-db`를 돌려 실제 `QA_SCOPE deep=checked deno=checked full_mobile_flow=NOT_RUN` 종료 확인이 필요하다.
