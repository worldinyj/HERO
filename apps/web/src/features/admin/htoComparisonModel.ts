export interface HtoConditions {
  clearIdentification: boolean;
  verificationSupport: boolean;
}

export type HtoChoice = "continue" | "check" | "ask";

export const HTO_CHOICES: Array<{ id: HtoChoice; label: string }> = [
  { id: "continue", label: "익숙한 외형을 근거로 진행한다." },
  { id: "check", label: "조작하지 않고 표시와 문서의 근거를 대조한다." },
  { id: "ask", label: "불확실성을 팀에 알리고 확인 지원을 요청한다." },
];

/** Qualitative teaching assumptions, deliberately separate from game evaluation. */
export function describeHtoConditions(conditions: HtoConditions, choice: HtoChoice) {
  const identification = conditions.clearIdentification
    ? "표시가 대상과 조작 기능을 구분해 줍니다. 근거를 대조하기 쉬워지지만 표시만으로 회로의 정상 여부까지 확인할 수는 없습니다."
    : "표시만으로 대상과 조작 기능을 구분하기 어렵습니다. 익숙한 외형에 기대거나 첫 판단을 반복할 가능성을 살펴봅니다.";
  const support = conditions.verificationSupport
    ? "팀이 확인 시간을 확보하고 별도의 검증 담당자에게 연결해 줍니다. 지원이 있어도 확인 근거와 승인 범위를 실제로 대조해야 합니다."
    : "이 연습에서는 즉시 이용할 확인 시간과 검증 지원이 확보되지 않았다고 가정합니다. 실제 사건의 조직 상태를 뜻하지 않습니다.";
  const action = choice === "continue"
    ? "같은 진행 판단을 유지했습니다. 표시와 지원이 개선되어도 남은 불확실성이 해소됐는지 확인하지 않고 진행하는 문제는 남습니다."
    : choice === "check"
      ? "조작을 보류하고 근거를 대조하는 판단입니다. 명확한 표시는 확인을 돕고, 별도 검증 지원은 표시·문서의 일치만으로 놓칠 수 있는 사항을 살피게 합니다."
      : "팀에 확인 지원을 요청하는 판단입니다. 지원이 마련되어 있으면 다음 확인으로 연결하기 쉽고, 지원이 부족하면 멈춤을 유지하면서 확인 경로를 마련할 필요가 있습니다.";
  return { identification, support, action,
    uncertainty: "잠재적인 회로·도면 오류는 이 비교에서 제거하지 않았습니다. 표시 개선이나 조직 지원만으로 안전 완료를 보장하지 않으며 실제 사건 결과·확률을 예측하지 않습니다." };
}
