# HERO Release Evidence Gate

| 항목 | 내용 |
|---|---|
| 상태 | 운영/승인 증거 기록용 |
| 기준일 | 2026-10-07 |
| 대상 | MVP Release 1 |
| 기계 판독 파일 | `ops/release-evidence.json` |
| 검사 | `pnpm check:release-evidence` |
| 최종 수동 게이트 | GitHub Actions → **Release Candidate Gate** |

## 1. 목적

HERO는 코드 CI 통과와 실제 출시 승인을 분리한다.

법무·개인정보, 외부 배포, 실기기, 사내망, 파일럿과 같은 항목은 자동화가 대신 승인할 수 없다. 대신 사람이 승인한 뒤 그 결과와 증거 참조를 `ops/release-evidence.json`에 기록하고, Release Candidate Gate가 필수 증거의 존재와 형태를 검사한다.

이 파일의 `status`를 바꾸는 행위 자체가 승인을 의미하지 않는다. 반드시 `approvedBy`, `approvedAt`, `evidenceRef`가 함께 있어야 한다.

## 2. 오디오 릴리스 정책

`audioPolicy`는 다음 세 값만 허용한다.

- `deferred`: 아직 포함/제외 결정을 하지 않음. **Release Candidate 차단**
- `excluded`: 이번 릴리스에서 BGM/SFX 자산을 명시적으로 제외. 오디오 런타임은 남아 있으나 승인 자산 0건이어도 RC 가능
- `included`: 승인 오디오를 릴리스에 포함. audio manifest의 승인 자산과 `audioQc` 사람 승인이 모두 필요

따라서 “오디오는 별도 생성 예정” 상태는 개발 중에는 `deferred`로 유지할 수 있지만, 실제 v1.0 후보를 만들 때는 `excluded` 또는 `included`를 명시적으로 결정해야 한다.

## 3. 사람 승인 증거

필수 승인 항목:

- `legalPrivacy`: 이용약관·개인정보 처리방침 최종 승인
- `externalDeployment`: Supabase/Cloudflare/Kakao 실제 설정 완료 확인
- `realDevice`: Kakao 인앱, Android Chrome, Samsung Internet, iOS Safari 실기기 확인
- `intranetPolicy`: 사내망·개인폰 접속 정책 확인
- `pilot`: 최소 30명 파일럿, Blocker 0
- `audioQc`: `audioPolicy=included`일 때만 필수

`evidenceRef`는 내부 결재번호, 검토문서 경로, 이슈/티켓 ID 등 조직에서 추적 가능한 참조값을 사용한다. 비밀번호·API 키·개인정보 원문을 넣지 않는다.

## 4. Staging Smoke 바인딩

Staging Smoke 결과는 manifest에 수동으로 “PASS”라고 적지 않는다.

Release Candidate Gate를 실행할 때 **성공한 Staging Smoke run ID**를 입력한다. workflow가 GitHub Actions API에서 다음을 직접 확인한다.

1. workflow 이름이 `Staging Smoke`
2. 실행 이벤트가 `workflow_dispatch`
3. conclusion이 `success`
4. branch가 `main`
5. **Staging Smoke의 head SHA가 Release Candidate Gate의 현재 SHA와 정확히 동일**

즉 staging에서 확인하지 않은 다른 커밋을 RC로 통과시키지 않는다.

## 5. 명령

현재 증거 상태 보고:

```bash
pnpm check:release-evidence
pnpm check:release-evidence -- --json
```

증거가 모두 완료됐는지 강제 검사:

```bash
pnpm check:release-evidence -- --strict
pnpm check:legal-release -- --strict
```

법무/개인정보 검사는 승인 증거만 보지 않는다. 검토문서와 실제 배포되는 `/terms`, `/privacy` UI 양쪽에서 `검토 초안`·`[확정 필요]` 표식이 제거되고 핵심 정책 문구가 유지되어야 통과한다.

validator 자체 회귀검사:

```bash
pnpm check:release-evidence -- --self-test
```

## 6. Release Candidate 순서

1. 경쟁 시나리오 3종 사람 승인과 SHA 고정 완료
2. 약관/개인정보 최종 문안 반영 및 승인 증거 기록
3. staging 외부 설정 완료 및 `externalDeployment` 승인 증거 기록
4. 실기기·사내망 검증 및 증거 기록
5. 파일럿 30명 이상, Blocker 0 확인
6. 오디오 정책을 `excluded` 또는 `included`로 확정
7. 현재 `main` SHA를 staging에 배포
8. **Staging Smoke** 수동 실행 및 PASS
9. 같은 SHA에서 **Release Candidate Gate** 실행, Staging Smoke run ID 입력
10. 생성된 90일 보존 evidence artifact를 최종 릴리스 승인자료에 첨부

Release Candidate Gate는 실제 production 배포를 수행하지 않는다. 모든 게이트가 닫혔다는 증거 패키지를 생성하는 역할만 한다.
