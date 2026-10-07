# HERO Release Handoff

| 항목 | 내용 |
|---|---|
| 목적 | 자동개발 이후 남은 사람/외부 의존 작업을 source-of-truth에서 실시간 요약 |
| 명령 | `pnpm report:release-handoff` |
| JSON | `pnpm report:release-handoff -- --json` |
| 승인 기록 | `pnpm update:release-evidence` |
| 최종 판정 | `pnpm check:mvp-readiness -- --strict` + Release Candidate Gate |

## 1. 이 문서의 역할

HERO의 코드·자동검증 영역은 MVP 수준에서 대부분 준비됐다. 남은 작업은 경쟁 시나리오 사람 승인, 공식 출처/권리 확인, 법무·개인정보 확정, 실제 외부환경 연결, 실기기·사내망, 파일럿, 오디오 릴리스 범위 결정처럼 자동화가 대신 승인할 수 없는 영역이다.

상태를 이 문서에 수동으로 복사해 관리하지 않는다. 아래 파일들이 source-of-truth다.

- 경쟁 시나리오: `scenarios/research/promotion-status.json`
- source/rights: `scenarios/research/source-evidence.json`
- 법무/개인정보 문안: `docs/07_TERMS_PRIVACY_DRAFT.md`, `apps/web/src/features/legal/LegalPage.tsx`
- 외부배포 체크리스트: `docs/09_DEPLOYMENT_BOOTSTRAP.md`
- 사람/운영 승인: `ops/release-evidence.json`
- 오디오 자산: `apps/web/public/audio/audio_manifest.json`

## 2. 현재 다음 작업 확인

```bash
pnpm report:release-handoff
```

리포터는 위 source-of-truth를 읽어 다음을 순서대로 보여준다.

1. `review_ready` 경쟁 시나리오의 사람 HF/익명화/debrief 검토
2. `source_hold` 시나리오의 공식 직접 레코드·권리 blocker
3. 법무/개인정보 문서와 실제 `/terms`, `/privacy` UI 최종화
4. Supabase·Cloudflare·Kakao staging 연결
5. 실기기 4종 검증
6. 사내망·개인폰 접속정책 승인
7. Release 1 오디오 포함/제외 결정 및 필요한 경우 audio QC
8. 30명 이상 파일럿·Blocker 0
9. 동일 `main` SHA Staging Smoke → Release Candidate Gate

상태가 바뀌면 리포터 출력도 자동으로 바뀐다.

## 3. 승인 기록 원칙

리포터가 보여주는 명령은 **승인을 만들어내는 명령이 아니다**. 실제 사람 검토·운영 확인이 끝난 뒤에만 증거를 기록한다.

```bash
# 항상 dry-run 먼저
pnpm update:release-evidence -- <승인 인수>

# 출력 확인 후 실제 적용
pnpm update:release-evidence -- <승인 인수> --apply
```

시나리오 역시 사람 검토가 완료된 뒤에만 `promote:scenario --apply`를 사용한다.

## 4. Release Candidate 직전

```bash
pnpm check:source-evidence
pnpm check:scenario-promotion
pnpm check:approval-hash
pnpm check:release-evidence -- --strict
pnpm check:legal-release -- --strict
pnpm check:mvp-readiness -- --strict
```

이후 현재 `main` SHA를 staging에 배포하고 GitHub Actions의 **Staging Smoke**를 실행한다. 성공한 같은 SHA의 run ID로 **Release Candidate Gate**를 실행한다.

> 자동화는 승인 증거의 형식·일관성·SHA 바인딩을 검증한다. 실제 HF, 법무, 개인정보, 보안정책, 실기기, 파일럿 승인 자체는 사람이 수행한다.
