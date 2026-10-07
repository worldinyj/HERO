# HERO Human Review Evidence Guide

경쟁 시나리오의 사람 검토 결과를 **검토 대상 콘텐츠 SHA-256에 묶어** 기록한다. 체크박스나 최종 승격 플래그만으로 사람 검토를 대체하지 않는다.

## 필수 검토 영역

1. `hf_accuracy` — HF 정확성·HU Tool 적용 맥락
2. `operations_context` — 원자력 운전/정비 맥락 및 사실성
3. `anonymization` — 익명화·운전정보 과노출
4. `just_culture` — 교육 목적·Just Culture·비난 방지
5. `incident_debrief` — 실사건 디브리프·공식 사실/HERO 해석 경계

모든 영역이 **동일한 현재 콘텐츠 SHA**에 대해 `pass`여야 최종 승격을 적용할 수 있다. JSON이 수정되면 SHA가 바뀌므로 과거 PASS는 새 버전에 자동 승계되지 않는다.

## 기록 방법

기본 실행은 preflight-only다.

```bash
pnpm record:scenario-review -- \
  --scenario=s03_procedure_reality_gap \
  --area=hf_accuracy \
  --decision=pass \
  --reviewed-by="HF 검토자 성명 또는 공식 역할" \
  --reviewed-at=YYYY-MM-DD \
  --evidence-ref="내부 검토문서/티켓/결재 참조" 
```

실제 사람이 해당 영역을 검토하고 결과를 확정한 뒤에만 `--apply`를 추가한다.

```bash
pnpm record:scenario-review -- \
  --scenario=s03_procedure_reality_gap \
  --area=hf_accuracy \
  --decision=pass \
  --reviewed-by="HF 검토자 성명 또는 공식 역할" \
  --reviewed-at=YYYY-MM-DD \
  --evidence-ref="내부 검토문서/티켓/결재 참조" \
  --apply
```

문제가 있으면 `--decision=hold`로 기록한다. 같은 SHA·영역에 후속 검토를 추가하면 **가장 최근 기록**이 유효 판정으로 사용된다. 과거 기록은 감사 이력으로 보존한다.

## 확인

```bash
pnpm check:human-review-evidence
pnpm promote:scenario -- --scenario=s03_procedure_reality_gap
```

최종 `promote:scenario --apply`는 기존 source/rights gate, 명시적 확인 플래그와 함께 **5개 사람 검토 영역의 current-SHA PASS**도 요구한다.

> `evidenceRef`에는 추적 가능한 내부 참조만 기록한다. 비밀번호, API key, 개인 민감정보 원문을 저장하지 않는다.
