# Structured Human Review Records

이 디렉터리는 경쟁 시나리오의 **사람 검토 기록**을 Git 이력에 남기기 위한 공간이다.

- 템플릿 파일은 승인 기록이 아니다.
- `decision=approved`, 모든 `checks=pass`, 두 attestation이 모두 `true`가 되어야 승인 후보가 된다.
- `contentSha256`은 실제 검토한 JSON의 SHA-256과 정확히 일치해야 한다.
- 승인 후 시나리오 JSON이 1바이트라도 바뀌면 기존 검토 기록은 자동으로 승격에 사용할 수 없다.
- 검토자 이름/역할·일자는 사람이 직접 작성한다. 자동화가 채우지 않는다.

## 권장 절차

1. 현재 사람 검토 패킷의 SHA-256과 검토 대상 JSON이 같은지 확인한다.
2. 해당 시나리오의 `*.template.json`을 복사해 `*.review.json`으로 만든다.
3. 각 검토영역을 실제로 확인하고 `pending`을 `pass` 또는 `hold`로 변경한다.
4. 최종 승인이라면 `decision=approved`, 검토자/일자, 두 attestation을 채운다.
5. 승격 preflight에서 구조화 기록을 검증한다.

예:

```bash
pnpm promote:scenario -- \
  --scenario=s03_procedure_reality_gap \
  --review-file=scenarios/research/reviews/s03_procedure_reality_gap.review.json

pnpm promote:scenario -- \
  --scenario=s03_procedure_reality_gap \
  --review-file=scenarios/research/reviews/s03_procedure_reality_gap.review.json \
  --apply
```

구조화 검토 파일과 기존 `--approved-by / --confirm-*` 수동 플래그 방식은 동시에 사용하지 않는다.
