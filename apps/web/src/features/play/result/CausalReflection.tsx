import type { GameState } from "@hero/engine";
import type { Scenario } from "@hero/schema";

interface ReflectionOption {
  id: string;
  title: string;
  detail: string;
}

function reflectionOptions(
  scenario: Scenario,
  game: GameState,
): ReflectionOption[] {
  const options: ReflectionOption[] = [
    {
      id: "initial_conditions",
      title: "상황이 시작되기 전부터",
      detail: "시간압박·불확실성·준비상태 같은 조건이 이미 방어막에 영향을 주고 있었다.",
    },
  ];

  for (const entry of game.log) {
    if (entry.actionType !== "choice" || !entry.actionId) continue;

    const node = scenario.nodes[entry.nodeId];
    if (!node || node.type !== "decision") continue;

    const choice = node.choices.find(
      (candidate) => candidate.actionId === entry.actionId,
    );

    options.push({
      id: entry.nodeId,
      title: node.prompt,
      detail: choice
        ? `내 선택: ${choice.label}`
        : `선택 ID: ${entry.actionId}`,
    });
  }

  return options;
}

export function CausalReflection({
  scenario,
  game,
  selected,
  onSelect,
  onContinue,
}: {
  scenario: Scenario;
  game: GameState;
  selected: string | null;
  onSelect: (id: string) => void;
  onContinue: () => void;
}) {
  const options = reflectionOptions(scenario, game);

  return (
    <article className="review-card">
      <p className="eyebrow">Causal Reflection</p>
      <h2>어느 시점부터 방어막이 약해졌을까요?</h2>
      <p className="muted">
        정답을 고르는 문제가 아닙니다. 한 사람의 마지막 행동보다 조건과 방어막이
        어떻게 겹쳤는지 돌아보세요.
      </p>

      <div
        className="reflection-options"
        role="radiogroup"
        aria-label="방어막 약화 시점 회고"
      >
        {options.map((option, index) => {
          const checked = selected === option.id;

          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={checked}
              className={
                checked
                  ? "reflection-option reflection-option--selected"
                  : "reflection-option"
              }
              onClick={() => onSelect(option.id)}
            >
              <span className="reflection-index">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>
                <strong>{option.title}</strong>
                <small>{option.detail}</small>
              </span>
            </button>
          );
        })}
      </div>

      <p className="review-note">
        같은 결과라도 서로 다른 시점에서 방어막 약화를 느낄 수 있습니다. 다음
        화면에서 실제 엔진 로그의 방어막 상태를 확인합니다.
      </p>

      <button
        type="button"
        className="primary-button"
        disabled={!selected}
        onClick={onContinue}
      >
        내 생각 확인
      </button>
    </article>
  );
}
