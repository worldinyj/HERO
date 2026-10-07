# HERO T3 Draft Balance Report V1

> 기준 실행: GitHub Actions CI run 138 / 2026-10-07  
> 엔진: 실제 HERO deterministic engine + `simulateScenarioPaths`  
> seed: 기본 고정 simulation seed 3종  
> 상태: **연구 draft용 결과. 사람 HF 승인 전 publish 금지**

## 1. 전체 결과

| Draft | Explored states | Terminal paths | HP range | Mean HP | Safe Complete | Safe Stop | Near Miss | Event |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| S01 `s01_time_pressure` | 12,511 | 7,176 | 181–246 | 235.8 | 4,204 (59%) | 2,392 (33%) | 508 (7%) | 72 (1%) |
| S02 `s02_equipment_identity` | 11,775 | 6,624 | 184–248 | 240.2 | 4,296 (65%) | 2,208 (33%) | 112 (2%) | 8 (<1%) |
| S03 `s03_procedure_reality_gap` | 11,775 | 6,624 | 182–246 | 238.2 | 4,296 (65%) | 2,208 (33%) | 96 (1%) | 24 (<1%) |

세 draft 모두:

- schema / graph validation PASS
- path exploration COMPLETE
- 4종 엔딩 모두 reachable
- `dominant_choice_bias` 없음
- `ending_imbalance` 없음
- path/state/action limit 오류 없음

CI에서 발생한 `ending_imbalance` 경고는 **S00 튜토리얼의 safe_complete 99%**에 대한 기존 경고이며, S01~S03 draft에서는 발생하지 않았다.

## 2. S01 관찰

### 첫 결정 — 일정변경

| action | mean HP | favorable ending |
|---|---:|---:|
| rebrief_changed_schedule | 239.2 | 100% |
| confirm_changed_boundary | 237.5 | 95% |
| use_original_briefing | 231.7 | 83% |

### Hold Point

| action | mean HP | favorable ending |
|---|---:|---:|
| hold_and_verify_conditions | 238.6 | 96% |
| repeat_back_hold_instruction | 238.6 | 96% |
| advance_familiar_test_step | 231.0 | 84% |

판정:
- 일정압박 주제가 엔딩 분포에 실제로 반영됨.
- “재브리핑만이 정답”이 되지 않고 작업경계 확인도 유사한 학습가치를 가짐.
- 사건/near-miss가 약 8% 존재해 방어막 차이를 체감할 수 있음.
- **현재 draft 중 밸런스 상태가 가장 양호.**

## 3. S02 관찰

### 대상 식별

| action | mean HP | favorable ending |
|---|---:|---:|
| inspect_local_identification | 241.6 | 100% |
| compare_work_document | 241.8 | 100% |
| proceed_from_context | 237.4 | 95% |

### 최종 확인

| action | mean HP | favorable ending |
|---|---:|---:|
| request_independent_check | 241.0 | 100% |
| pause_and_contact_supervisor | 241.0 | 100% |
| self_check_then_proceed | 238.6 | 95% |

판정:
- 현장 식별과 문서대조가 거의 동일한 가치로 나타나 “하나의 정답 버튼” 문제는 없음.
- near_miss/event가 약 2%로 적다.
- 실제 교육에서 “방어막을 쓰지 않았을 때의 차이”를 더 명확히 보여줄 필요가 있다면 `hazard_identity` threshold 또는 초기 barrier/PSF를 조정할 수 있음.
- 다만 사건을 과도하게 자주 발생시키면 “조금 확인 안 하면 바로 사고”라는 비현실적 메시지가 될 수 있어 **HF 사람 검토 후 조정**한다.

## 4. S03 관찰

### 상태-절차 정합성

| action | mean HP | favorable ending |
|---|---:|---:|
| pause_compare_current_state | 240.0 | 100% |
| share_trend_with_peer | 239.7 | 100% |
| continue_expected_sequence | 235.1 | 95% |

### 설정 방향 확인

| action | mean HP | favorable ending |
|---|---:|---:|
| peer_check_setting_direction | 239.8 | 100% |
| place_keep_and_recheck | 239.7 | 100% |
| enter_then_watch_response | 235.3 | 95% |

판정:
- Questioning Attitude와 Peer/Place Keeping의 선택 가치가 근접해 정답편향이 낮음.
- near_miss/event는 약 2% 수준으로 적다.
- 공식 사건이 “설정 방향 입력 오류 → 자동정지”였다는 점을 학습하려면 위험경로 체감성을 약간 높일 수 있으나, 실제 HRA 확률을 표현하는 것이 아니므로 단순 확률맞추기식 조정은 하지 않는다.

## 5. 다음 밸런스 게이트

S01:
- [x] 모든 엔딩 reachable
- [x] dominant choice warning 0
- [x] ending imbalance warning 0
- [ ] HF 사람 검토

S02:
- [x] 모든 엔딩 reachable
- [x] dominant choice warning 0
- [x] ending imbalance warning 0
- [ ] near_miss/event 2% 수준 유지 여부 HF 검토
- [ ] OPIS 상세원문 대조
- [ ] HF 사람 검토

S03:
- [x] 모든 엔딩 reachable
- [x] dominant choice warning 0
- [x] ending imbalance warning 0
- [ ] near_miss/event 2% 수준 유지 여부 HF 검토
- [ ] HF 사람 검토

## 6. 원칙

이 비율은 실제 사건확률, HEP, 발전소 위험도를 의미하지 않는다. **교육용 게임 경로의 상대적 분포**일 뿐이며, 사용자의 능력이나 실제 현장 위험을 수치화하는 용도로 사용하지 않는다.
