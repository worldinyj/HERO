# S03 Cause Traceability Matrix V1 — KINS 사건조사보고서 기반

> 대상: `s03_procedure_reality_gap`  
> 기준자료: KINS 「원전 사고·고장 조사 보고서 제2026-03호(260811SU3)」  
> 기준일: 2026-10-08  
> 상태: **REVIEW_SUPPORT — HUMAN HF/OPERATIONS REVIEW REQUIRED**  
> 기계검증 원본: `scenarios/research/cause-traceability.json` · CI: `pnpm check:cause-traceability`

## 1. 목적

이 문서는 S03의 사건원인 분석이 조사보고서의 사실과 재발방지대책에 어떻게 연결되는지 검토자가 추적할 수 있도록 만든 내부 검토자료다. 동일 구조는 `cause-traceability.json`에 기계 판독형으로 저장되며 CI가 scenario version, 원인 개수, barrier/action 참조, 공개정보 일반화를 검증한다.

HERO는 다음을 엄격히 구분한다.

- **KINS 확인사실 / 평가:** 조사보고서가 직접 확인하거나 적절하다고 판단한 내용
- **HERO 원인분류:** KINS 사실을 Direct Cause / Root Cause / Contributing Cause·Factor로 교육용 재구성한 것
- **공식 재발방지대책:** 조사보고서 §3.5에 제시되고 KINS가 원인분석 결과에 근거한 대책으로 검토한 내용

KINS 보고서가 모든 원인을 Direct / Root / Contributing taxonomy로 명명한 것은 아니다. 따라서 아래의 Root Cause 명칭은 **HERO의 분석 분류**이며 KINS의 공식 근본원인 판정으로 인용해서는 안 된다.

---

## 2. Source Anchor

| 항목 | 내용 |
|---|---|
| 보고서 | 원전 사고·고장 조사 보고서 제2026-03호(260811SU3) |
| 사건 | 새울3호기(시운전) 소내부하운전 중 원자로냉각재펌프 속도 감소로 인한 원자로 자동정지 |
| 핵심 원인구간 | §3.2.2 터빈제어밸브 위치제한기 설정치 변경과정 및 오류발생 원인 |
| 재발방지대책 | §3.5 재발방지대책 적절성 평가 |
| 공개게임 원칙 | 발전소/호기/고유기기명/정확한 설정값/보호정정값/실제 화면은 일반화 |

---

## 3. Corrective Action ID

| ID | 조사보고서의 조치군 | HERO 요약 |
|---|---|---|
| CA-01 | 운영절차서 개선 — VPL 설정치 변경 | 소내부하운전 중 불필요한 조작을 명확히 하고, CVR/LDR 편차 가능성·조작 전 비교·조작 후 감시를 절차화 |
| CA-02 | 운전행위 특별교육 | 자기진단, Questioning Attitude, 조작 목적·의도 명확화 교육 |
| CA-03 | 중요 시운전시험 Oversight | 중요 조작·절차의 타당성 검증과 반론 기능 강화 |
| CA-04 | 주제어실 출입관리 강화 | 필수인원 중심 출입통제로 집중도·정보교환 조건 개선 |
| CA-05 | MMIS 주의사항/경고 반영 | 관련 기준값 주변 경고·추가정보 제공 |
| CA-06 | 설정치 입력프로세스 강화 | 적용 전 재확인 단계를 추가하여 단일 입력오류의 즉시 반영 방지 |
| CA-07 | 미예정 운전행위 사전점검 | 절차적 근거·대상기기·조작/감시·예상반응·운전방벽 사전 검토 |
| CA-08 | 운전원 재교육/시뮬레이터 OE | 제어논리 재교육, 중요 운전경험 공유, 사건 모의 시뮬레이터 훈련 |

> 보고서의 EDG, 필수냉동기, 주살수배관, 저전압계전기, 비상운전절차서 개정 조치는 사건 전체의 후속 이슈에는 중요하지만, S03의 **원자로 자동정지 개시 원인사슬**과 직접 대응하지 않으므로 이 매트릭스의 주 원인-대책 연결에서는 분리한다.

---

## 4. Cause → Evidence → Barrier → Corrective Action

| ID | HERO 분류 | 원인/조건 | KINS 근거 수준 | 조사보고서 근거 | 약화·실패 방어막 | 연결 대책 |
|---|---|---|---|---|---|---|
| DC-01 | Direct Cause | 현재 밸브개도 기준보다 낮은 제한 설정값이 입력되어 터빈제어밸브가 닫힘 | **Explicit fact** | §3.2.2: LDR을 기준으로 설정치를 계산·지시했고 입력값 적정성 검토 없이 입력 | Self Check, 별도 확인, 입력 재확인 방어막 부족 | CA-01, CA-05, CA-06 |
| DC-02 | Direct Cause | 제어밸브 폐쇄 → 터빈속도/발전기 주파수 감소 → RCP 속도 감소 → 원자로보호신호 → 자동정지 | **Explicit event chain** | 사건요약·§2·§3.2.2 및 사건전개 개략도 | Expected-response monitoring은 조기차단 관점에서 약화; 원자로보호계통 동작 자체는 **실패방어막이 아님** | CA-01, CA-05, CA-06 |
| RC-01 | Root Cause — HERO | 사전 계획되지 않은 중요 운전행위를 실행하기 전 목적·근거·방법·예상반응·방어막을 팀 단위로 재검토하는 관리방어막 부족 | **HERO classification from KINS findings** | §3.2.2: 사건 직전 필수조작이 아니었고 사전 계획되지 않았으며 briefing/update 미활용 | 사건 당시 미예정 운전행위 사전점검 방어막 부재/미작동, Briefing/Update 미활용 | CA-03, CA-07 |
| RC-02 | Root Cause — HERO | 소내부하운전 상태에서 두 제어 기준값이 달라질 수 있다는 제어논리 이해가 설정치 계산에 연결되지 않음 | **HERO classification from explicit finding** | §3.2.2: 계통연결 시와 달리 소내부하운전에서는 CVR/LDR 편차 가능; 사건 당시 두 값을 동일하다고 착각 | Knowledge/Mental Model, Self Check, Questioning Attitude | CA-01, CA-02, CA-05, CA-08 |
| RC-03 | Root Cause — HERO | 중요 설정치의 입력 전 별도 확인과 입력 후 설비반응 감시가 단일 오류를 차단하도록 중첩되지 않음 | **HERO classification from explicit finding** | §3.2.2: 지시 설정치 검토 없이 입력, Questioning Attitude·자기진단 미흡, 변경 후 상태감시 미흡 | Self Check, 별도 확인/Peer Check/Independent Verification 방어막, Post-manipulation Monitoring, 사건 당시 부재한 HMI 재확인 방어막 | CA-01, CA-02, CA-05, CA-06 |
| CF-01 | Contributing Factor | 시운전 참관 인원 다수로 운전집중도 저하 및 정보교환 저해 | **Explicit finding** | §3.2.2 KINS 검토결론 | Work Environment, Communication | CA-04 |
| CF-02 | Contributing Factor | 설정치 입력 운전원이 온도제어 등 경쟁 업무에 주의를 동시에 배분 | **Explicit context** | §3.2.2 운전원 업무상황 | Attention Management, Workload | CA-03, CA-07 |
| CF-03 | Contributing Factor | 터빈 진동 경험과 계통연결 후 과도 우려로 신속한 계통연결/추가 제한 필요성을 판단 | **Explicit context/evaluation** | §3.2.2 VPL 변경 판단 | Conservative Decision Check, Unplanned-action review | CA-03, CA-07 |
| CF-04 | Contributing Factor | 미예정 조작의 목적과 진행방법을 팀에 충분히 공유하지 않음 | **Explicit finding** | §3.2.2 briefing/update 미활용 | Briefing/Update, Communication | CA-02, CA-07 |
| CF-05 | Contributing Factor | Questioning Attitude와 자기진단 사용 미흡 | **Explicit finding** | §3.2.2 | Questioning Attitude, Self Check | CA-02, CA-08 |
| CF-06 | Contributing Factor | 조작 후 관련 계통·기기 상태감시 미흡 | **Explicit finding** | §3.2.2 | Expected-response Monitoring | CA-01, CA-08 |

---

## 5. Corrective Action Coverage Check

| Cause ID | 대응 대책 존재 | 단일대책 의존 여부 | 검토 메모 |
|---|---|---|---|
| DC-01 | YES | NO | 절차 + HMI + 입력재확인의 다중 방어막 |
| DC-02 | YES | NO | 직접 물리사슬 자체보다 오류 조기차단·감시를 강화 |
| RC-01 | YES | NO | Oversight + 미예정행위 사전점검 |
| RC-02 | YES | NO | 절차 + 교육 + HMI 정보 + 시뮬레이터 |
| RC-03 | YES | NO | 절차 + 교육 + HMI + 재확인 |
| CF-01 | YES | YES | 주제어실 출입관리의 효과성은 사람검토 필요 |
| CF-02 | PARTIAL | NO | 경쟁업무 자체에 대한 직접 대책보다는 Oversight/사전점검으로 간접 대응 |
| CF-03 | YES | NO | 사전점검과 Oversight가 판단편향/즉흥조작을 견제 |
| CF-04 | YES | NO | 교육 + 사전점검 |
| CF-05 | YES | NO | 특별교육 + OE/시뮬레이터 |
| CF-06 | YES | NO | 절차의 조작후 감시 + 시뮬레이터 |

---

## 6. Recovery HF Boundary

원자로 자동정지 후 비상운전절차 수행에서 확인된 과다급수, 과냉, MSIS reset 관련 미흡사항은 별도의 중요한 HF 이슈다. 그러나 이는 **원자로 자동정지를 발생시킨 원인**이 아니므로 S03의 Direct/Root/Contributing cause chain에 포함하지 않는다.

HERO에서는 다음 원칙을 적용한다.

```text
Trip Initiation Cause Chain
  ≠
Post-Trip Recovery HF Issues
```

후속 교육 시나리오로 활용할 경우 별도 원인분석과 별도 Decision Node를 구성한다.

---

## 6.1 S03 v4 gameplay source-alignment correction

KINS §3.2.2는 사건 직전의 제한 설정 변경을 **사전 계획된 필수 단계가 아니라 당시 꼭 필요한 조작이 아니었던 미예정 행위**로 평가한다. 따라서 v4에서는 게임 도입부의 “절차상 다음 설정을 입력할 차례” 표현을 제거하고 다음과 같이 수정했다.

- 사전 계획에 없던 추가 설정 변경이 제안된 상황으로 제시
- 현재 운전상태에서 조작의 **필요성 자체**를 재확인하는 선택지를 추가
- 필요성이 확인되지 않으면 조작을 수행하지 않는 `safe_stop` 경로 추가
- 입력값 경고/재확인 UI와 미예정행위 사전점검은 사건 당시 존재해 실패한 방어막처럼 쓰지 않고, **부재 또는 미작동한 방어막**으로 표현

이 변경은 사건의 기술 세부를 더 노출하기 위한 것이 아니라, 공식 조사결과의 인과구조와 교육용 의사결정 구조를 더 일치시키기 위한 것이다.

## 7. Human Review Questions

- [ ] DC-01/DC-02의 범위가 “직접원인”으로 적절한가?
- [ ] RC-01~03이 KINS 사실을 벗어난 과도한 근본원인 추정은 아닌가?
- [ ] RC-02를 개인 지식부족이 아니라 운전상태별 mental model/절차·훈련·HMI 방어막과 연결한 방식이 적절한가?
- [ ] CF-02/CF-03이 원인과 단순 배경조건 사이에서 적절히 분류되었는가?
- [ ] 보호계통의 정상동작을 실패방어막으로 오해하게 하는 표현이 없는가?
- [ ] CA-01~08과 원인 간 연결이 조사보고서의 범위를 넘지 않는가?
- [ ] 공개 JSON의 일반화 수준이 실제 운전절차/설정값을 역추적하기 어렵게 충분히 낮아졌는가?
- [ ] Trip initiation과 post-trip recovery 문제를 명확히 분리했는가?

## 8. Promotion Rule

이 매트릭스는 승인 증거가 아니라 **검토 지원자료**다.  
S03 승격은 동일한 scenario SHA-256에 대해 다음 5개 human-review 영역이 모두 PASS일 때만 가능하다.

1. HF accuracy
2. operations context
3. anonymization / operational overexposure
4. Just Culture / education
5. incidentDebrief / source boundary
