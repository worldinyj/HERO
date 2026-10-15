# T4-09 첫 화면 로딩 개선

## 초대·정책 화면 코드 분리 (2026-10-15)

`db48d039e0850d0d796a19472f0c9d21ed4c3e81`에서 로그인에 필요하지 않은 초대 등록 화면과 약관·개인정보 문서가 App 셸에 정적으로 포함되어 있었다. 이 세 경로를 기존 Suspense/오류 경계 안에서 lazy import하도록 바꿨다. 약관과 개인정보는 같은 모듈을 재사용하고, 초대 처리와 문서 본문은 유지한다.

| manifest로 추적한 초기 JS | 변경 전 | 변경 후 | 감소 |
|---|---:|---:|---:|
| 비압축 | 547,241 bytes | 530,654 bytes | 16,587 bytes (3.0%) |
| gzip 합계 | 158,021 bytes | 153,184 bytes | 4,837 bytes (3.1%) |

같은 로컬 도구와 production 설정으로 빌드한 정적 크기 비교다. 실제 전송량이나 LCP를 측정한 결과는 아니다. `check-route-splitting.mjs`에 초대·정책 모듈을 추가해 분리 유지 여부를 검사한다. 로그인에서 약관·개인정보로 이동하고 돌아오는 흐름과 기존 초대 화면은 모바일 E2E로 확인한다.

로그인·관리자 화면의 App 셸은 제품명과 스키마 버전만 사용하지만, 기존 engine/schema barrel 진입점에서 게임 엔진과 Zod 시나리오 스키마가 함께 평가되어 초기 번들에 포함됐다. 제품명을 `@hero/engine/metadata`, 버전을 `@hero/schema/version`으로 분리하고 셸에서 해당 가벼운 진입점만 사용한다. 기존 패키지 진입점의 export와 실제 시나리오 검증은 유지한다. 플레이 및 시나리오 관리 화면에서 필요한 검증 코드는 lazy chunk로 로드된다.

## 로컬 비교 결과 (2026-10-11 KST)

기준 main SHA: `38bcd40a648d7e9f26597c0489bf74cad5767395`.

| 항목 | 이전 | 개선 후 | 감소 |
|---|---:|---:|---:|
| 초기 JavaScript, 비압축 | 639,824 bytes | 534,040 bytes | 16.5% |
| 초기 JavaScript, gzip 합계 | 183,443 bytes | 153,606 bytes | 16.3% |
| 로그인 LCP 중앙값, 3회 | 1,460 ms | 1,308 ms | 10.4% |

측정 조건: Chromium 390×844, CPU 4배 slowdown, 지연 150ms, 다운로드 200,000 bytes/s, 매회 새 브라우저 컨텍스트와 비활성 캐시, service worker 차단. localhost production preview만 허용하고 외부 네트워크 요청은 차단했다. 이는 해당 Mac의 통제된 로컬 비교이며 실제 카카오 내부 브라우저·기기·운영망의 LCP 보장이 아니다. 실제 사용자 인증시간은 포함하지 않는다. 원자료: `ops/initial-load-performance-20261011.json`.

## 회귀 방지와 재현

`node scripts/check-initial-load-budget.mjs`는 Vite manifest의 index 진입점과 정적 import만 추적하여 초기 JS의 비압축 550 KiB/gzip 160 KiB 한도를 검사한다. 게임 lazy import는 초기 다운로드 합계에 포함하지 않는다. 개선 빌드는 통과하고 이전 기준 빌드가 실제로 한도를 초과해 거절되는 것을 확인했다. CI에서 build 직후 검사한다. 이 크기 검사는 LCP 측정을 대신하지 않는다.

```sh
pnpm build
node scripts/check-initial-load-budget.mjs
pnpm --dir apps/web exec vite preview --host 127.0.0.1 --port 4175 --strictPort
# 다른 터미널에서 실행. 로컬 loopback만 허용한다.
node scripts/measure-initial-load.mjs http://127.0.0.1:4175 /tmp/hero-initial-load.json
```

타입 검사·ESLint·빌드·engine 19/web 304 단위 테스트 통과. submit-session/admin-scenario Deno check도 통과했다. 실제 기기 검증과 운영 반영은 별도 상태로 관리한다. DB 마이그레이션이나 사용자·초대 정보 변경은 없다.
