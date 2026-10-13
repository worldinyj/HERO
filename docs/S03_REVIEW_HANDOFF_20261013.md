# S03 v4 전문가 검토 인계 — 2026-10-13

현재 상태는 **REVIEW_READY / 사람 검토 0/5 / 최종 승인 대기**다. 검토 화면과 결과 파일 작성·가져오기는 구현됐다. 이번 작업은 검토 자료 준비이며 전문가 판정·배포용 콘텐츠 승격은 포함하지 않는다.

## 1. 고정된 검토 대상

| 항목 | 값 |
|---|---|
| 소스 기준 | main `5976d53020e96b92493d5bfc3f1b913360af0067` |
| Scenario ID / Version | `s03_procedure_reality_gap` / `4` |
| JSON | `scenarios/drafts/S03_procedure_reality_v1.json` |
| SHA-256 | `f0560093b22ff77a2b9af30afc45ee575690da51b8882c5a8f9aff3a7cf7ee87` |
| 원문·권리 상태 | sourceRightsComplete=true; 실제 전문가 검토는 별도 |
| 사람 검토 기록 | `scenarios/research/human-review-evidence.json`: reviews=[] |

파일명의 v1과 실제 JSON의 version=4를 혼동하지 않는다. 검토·판정은 위 콘텐츠 해시에 묶인다. 대상이 바뀌면 기존 판정을 승계하지 않는다.

## 2. 읽을 자료와 판단할 내용

검토자는 [자동 생성 패킷](../scenarios/research/generated/s03_procedure_reality_gap_HUMAN_REVIEW.md)과 위 JSON 원문을 함께 읽는다. 패킷의 기술검증은 사람의 사실/HF 승인이 아니다.

| 영역 ID | 판단할 내용 | 참고 |
|---|---|---|
| `hf_accuracy` | 마지막 입력 행동을 근본원인으로 끝내지 않는지; HU Tool 역할·원인/방어막/대책 연결이 타당한지 | [HF brief](../scenarios/research/S03_HF_BRIEF_V1.md), [추적성 표](../scenarios/research/S03_CAUSE_TRACEABILITY_MATRIX_V1.md) |
| `operations_context` | 변경 조작이 미예정·비필수로 제시되는지; 필요성 재확인·safe-stop이 적절한지; 정상 보호계통 작동과 사건 후 복구 이슈가 원인과 구분되는지 | [AI 사전검토의 확인 요구사항](../scenarios/research/S03_AI_PRE_REVIEW_V1.md), JSON |
| `anonymization` | 정확한 운전값·시험조건·고유기기/절차·복구 상세가 공개용 문안에서 일반화되어 있는지 | JSON 및 패킷 |
| `just_culture` | 개인 비난·도덕적 정답 단서·safe-stop을 실패로 보는 표현이 없는지 | 선택지·엔딩·회고 문구 |
| `incident_debrief` | 공식 사실과 HERO 교육 해석을 구분하는지; 조사기관의 공식 root-cause taxonomy로 오인되지 않는지; 출처/권리 표기가 적절한지 | JSON `incidentDebrief`, 추적성 표 |

이 문서는 기존 분석자료의 검토 질문을 정리한다. AI 사전판정은 **ADVISORY HOLD / HUMAN RE-REVIEW REQUIRED**이며 새 전문가 PASS를 만들지 않는다. 생성 패킷의 원문·출처 완결 표시는 저장소 검증 결과이고, 이번 세션에서 외부 원문을 새로 조회한 결과가 아니다.

## 3. 관리자 화면에서 결과 작성

1. 기존 관리자 계정으로 `/admin/scenarios`에 접근한다.
2. S03 검토 진행 영역에서 실제 대상 내용과 버전·해시 일치를 확인한다. 확인한 내용과 대상 SHA가 일치할 때만 작성한다.
3. 직접 검토한 영역마다 PASS 또는 HOLD를 선택하고 검토자/역할·한국 날짜·추적 가능한 근거 참조를 적는다. HOLD에는 보완 사유가 필요하다.
4. 직접 검토 확인 후 JSON 결과 파일을 다운로드한다. 화면 이탈/새로고침 전에 다운로드한다. 입력은 서버·브라우저 저장소에 자동 보관되지 않는다.
5. 파일을 담당자에게 전달한다. 영역별 부분 검토도 가능하며 다운로드만으로 승인·게시 상태는 바뀌지 않는다.

실제 전문가 배정·전달은 담당자가 수행한다. 이 작업에서 검토자에게 메시지를 보내거나 대리 판정을 기록하지 않는다.

## 4. 담당자의 기록 반영

최신 저장소에서 먼저 사전검사한다. 경로는 실제 다운로드 파일로 바꾼다.

```bash
pnpm import:scenario-review -- --file=./review-result.json
```

담당자가 실제 검토자·근거·내용을 확인한 결과에 한해서 다음을 실행한다.

```bash
pnpm import:scenario-review -- --file=./review-result.json --apply --confirm-human-review
pnpm check:human-review-evidence
pnpm build:scenario-review-status
pnpm check:scenario-review-status
pnpm build:review-packet -- --scenario=s03_procedure_reality_gap --check
```

기록 반영은 최종 승인·게시·시즌 연결과 별도다. 가져오기 도구는 해시/버전/날짜/근거·중복·과거 기록을 검증한다. 원본 JSON을 수정했다면 새 SHA로 자료를 다시 생성하고 재검토한다. JSON/검토 기록을 다른 편집 도구와 동시에 수정하지 않는다.

## 5. 종료 조건과 후속 단계

- 5개 영역 모두 **동일한 현재 SHA**의 유효 PASS여야 한다. HOLD/미검토 영역이 남으면 검토를 계속한다.
- 최종 콘텐츠 승인자·승인일·근거가 확인되면 [승격 안내](../scenarios/research/HUMAN_REVIEW_EVIDENCE_GUIDE.md)와 기존 `promote:scenario` 도구로 사전검사 후 승격한다.
- 사람 검토 JSON 반영·요약 갱신·승격을 각각 검증하고 커밋한다. 자동 게시하거나 승인되지 않은 콘텐츠를 시즌에 연결하지 않는다.
- S03 승인 완료가 S01/S02·법무·실기기·파일럿·v1.0 승인 완료를 뜻하지 않는다.

자세한 작성·가져오기 계약은 [44_SCENARIO_REVIEW_SUBMISSION.md](44_SCENARIO_REVIEW_SUBMISSION.md)를 따른다.
