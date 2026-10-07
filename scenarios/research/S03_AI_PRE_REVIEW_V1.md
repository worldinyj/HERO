# S03 AI Pre-Review V4 — 원인·대책 추적성 및 공개정보 일반화 재검토

> 대상: `s03_procedure_reality_gap` v4  
> 기준일: 2026-10-08  
> 상태: **ADVISORY HOLD — HUMAN RE-REVIEW REQUIRED**  
> 이 문서는 AI 사전검토이며 사람의 HF/운전/익명화 승인을 대신하지 않는다.

## 1. 재검토 사유

기존 V1은 2026-09-04 원자력안전위원회 보도자료를 중심으로 검토했다. 이후 사용자 제공 KINS 「원전 사고·고장 조사 보고서 제2026-03호(260811SU3)」 전체본이 추가되어, S03의 사건원인 구조를 단순한 “설정방향 입력 오류 + 재확인 방어막” 수준에서 다음 구조로 재작성했다.

- Direct Cause
- Root Cause — HERO 교육용 분류
- Contributing Cause / Factor
- Causal Chain
- Failed / Weakened Barriers
- Corrective Action traceability
- 사건 후 Recovery HF issue의 분리
- 공개 incidentDebrief의 정확한 운전값·고유 약어 추가 일반화

콘텐츠의 원인분석 범위가 실질적으로 변경되었으므로 기존 AI advisory pass를 자동 승계하지 않는다.

## 1.1 v4 source-alignment correction

v3의 게임 도입부에는 “절차상 다음 설정을 입력할 차례”라는 표현이 남아 있었으나, KINS §3.2.2는 사건 직전 설정 변경을 **사전 계획된 필수 단계가 아니라 당시 꼭 필요한 조작이 아니었던 미예정 행위**로 평가한다. 이 차이는 사건의 학습 포인트를 왜곡할 수 있어 v4에서 수정했다.

- 도입부를 “사전 계획에 없던 추가 설정 변경이 제안된 상황”으로 변경
- 현재 운전상태에서 조작의 필요성 자체를 재확인하는 선택지를 추가
- 필요성이 확인되지 않으면 조작을 수행하지 않는 safe-stop 경로 추가
- 사건 당시 존재하지 않았던 미예정행위 사전점검·입력 재확인 UI를 ‘실패한 기존 방어막’이 아니라 ‘부재/미작동한 방어막’으로 표현
- ‘독립검증’은 KINS의 명시적 제도요건으로 단정하지 않고 HERO 교육용 별도확인/방어막 매핑으로 한정

## 2. 소스 기반 확인사항

KINS 보고서에서 직접 확인되는 핵심은 다음과 같다.

1. 소내부하운전 중 VPL 설정치를 변경하면서 CVR이 아닌 LDR을 기준으로 낮은 설정값을 입력했다.
2. 설정값 오류로 터빈제어밸브 개도가 감소하고 발전기 주파수와 RCP 속도가 감소했다.
3. RCP 속도 저하가 원자로보호신호와 자동정지로 이어졌다.
4. VPL 변경은 사건 직전 필수적인 조작이 아니었고 사전 계획되지 않았다.
5. 주제어실 브리핑/업데이트가 사용되지 않았다.
6. 지시받은 설정값의 적정성 검토, Questioning Attitude·자기진단, 변경 후 상태감시가 미흡했다.
7. 다수의 시운전 참관 인원과 경쟁 운전업무가 집중도·정보교환에 영향을 주었다.
8. 재발방지대책에는 MMIS 경고/재확인, 미예정 운전행위 사전점검, 교육·시뮬레이터 반영 등이 포함된다.

## 3. AI 사전분류

| 구분 | AI 사전분류 | 사람 검토 포인트 |
|---|---|---|
| Direct Cause | 설정치 오입력 및 그에 따른 제어밸브/주파수/RCP 속도 저하 | 직접원인의 범위를 인적행위와 물리적 트리거로 나눈 방식이 적절한지 |
| Root Cause RC-1 | 미예정 중요 운전행위 관리 방어막 부족 | KINS가 공식 root cause taxonomy로 명명한 것처럼 읽히지 않는지 |
| Root Cause RC-2 | 운전상태별 LDR/CVR 관계에 대한 mental model gap | 지식/이해 부족으로 과도 단순화하지 않았는지 |
| Root Cause RC-3 | 중요 설정치 검증·사후감시 방어막 부족 | Peer Check·Independent Verification·Self Check의 역할 구분이 적절한지 |
| Contributing Factors | 참관인원, 경쟁업무, 신속한 계통병입 인식, 외부계통 과도 우려, briefing 미사용, QA/self-check 미흡, 사후감시 미흡 | 원인과 단순 상황조건의 경계가 적절한지 |
| Recovery HF | EOP 수행 중 과다급수·추가 과냉·MSIS 조정 | 자동정지의 발생원인과 섞이지 않았는지 |

## 4. 현재 AI 사전판정

- **사건 사실과 HERO 교육해석의 분리:** PASS WITH HUMAN CONFIRMATION
- **Direct / Root / Contributing 계층 분리:** PASS WITH HUMAN CONFIRMATION
- **개인 단일원인 프레이밍 회피:** PASS
- **Just Culture 방향:** PASS WITH HUMAN CONFIRMATION
- **HU Tool 매핑:** HUMAN CONFIRMATION REQUIRED
- **운전정보 과노출:** HUMAN CONFIRMATION REQUIRED
- **KINS taxonomy 오인 가능성:** HUMAN CONFIRMATION REQUIRED
- **Recovery issue 분리:** PASS WITH HUMAN CONFIRMATION
- **Cause ↔ Corrective Action 추적성:** PASS WITH HUMAN CONFIRMATION
- **공개 운전정보 일반화:** PASS WITH HUMAN CONFIRMATION
- **승격 준비:** HOLD

## 5. 사람 검토자가 반드시 확인할 항목

- [ ] KINS가 실제로 명시한 사실과 HERO가 분류한 Root Cause를 구분할 수 있다.
- [ ] “설정치 잘못 입력”을 근본원인으로 끝내지 않는다.
- [ ] 미예정 운전행위 관리, 운전모드별 mental model, 독립검증/사후감시가 근거 범위를 넘지 않는다.
- [ ] 주제어실 참관 인원·경쟁업무·신속성 인식 등을 기여요인으로 두는 것이 과도한 인과추정이 아니다.
- [ ] 보호계통 동작 자체를 실패한 방어막으로 표현하지 않는다.
- [ ] 사건 후 비상운전절차 수행의 미흡사항을 원자로 자동정지의 원인으로 혼합하지 않는다.
- [ ] 공개 시나리오가 실제 VPL/LDR/CVR 값·시험조건·MMIS 화면·절차번호를 재현하지 않는다.
- [ ] HU Tool과 방어막 매핑이 실제 원전 HF 사용맥락에 적합하다.
- [ ] incidentDebrief에서 Direct / Root / Contributing / Causal Chain / Failed Barriers / Corrective Actions가 교육적으로 이해 가능하다.
- [ ] `S03_CAUSE_TRACEABILITY_MATRIX_V1.md`의 원인-근거-방어막-대책 연결이 KINS 보고서 범위를 넘지 않는다.

## 6. 현재 콘텐츠 해시

검토 대상 JSON:

`scenarios/drafts/S03_procedure_reality_v1.json`

Version: `4`

SHA-256:

`f0560093b22ff77a2b9af30afc45ee575690da51b8882c5a8f9aff3a7cf7ee87`

사람 검토는 반드시 이 해시의 콘텐츠를 기준으로 수행한다. 이후 JSON이 변경되면 다시 검토한다.

## 7. 승격 조건

현재는 **사람 검토 전 승격 금지**이다.

HF 정확성, 원자력 운전/정비 맥락, 익명화·운전정보 과노출, 교육/Just Culture, incidentDebrief·출처경계의 검토가 동일 SHA에 대해 모두 PASS인 경우에만 promotion workflow를 진행한다.
