import type { Choice } from "@hero/schema";

export function ChoiceSheet({
  choices,
  selectedActionId,
  onSelect,
  onConfirm,
}: {
  choices: Choice[];
  selectedActionId: string | null;
  onSelect: (actionId: string) => void;
  onConfirm: (actionId: string) => void;
}) {
  function handleChoice(actionId: string) {
    if (selectedActionId === actionId) {
      onConfirm(actionId);
      return;
    }

    onSelect(actionId);
  }

  return (
    <div className="decision-section">
      <div className="choice-heading">
        <h3>행동 선택</h3>
        <span>첫 탭 선택 · 두 번째 탭 확정</span>
      </div>

      <div
        className="choice-list"
        role="radiogroup"
        aria-label="행동 선택"
      >
        {choices.map((choice, index) => {
          const selected = selectedActionId === choice.actionId;

          return (
            <button
              key={choice.actionId}
              type="button"
              role="radio"
              aria-checked={selected}
              className={
                selected
                  ? "choice-button choice-button--selected"
                  : "choice-button"
              }
              onClick={() => handleChoice(choice.actionId)}
            >
              <span className="choice-letter">
                {String.fromCharCode(65 + index)}
              </span>
              <span>{choice.label}</span>
              <small>
                {selected ? "한 번 더 탭해 확정" : `+${choice.timeCostMin}분`}
              </small>
            </button>
          );
        })}
      </div>

      <button
        className="primary-button confirm-choice"
        type="button"
        disabled={!selectedActionId}
        onClick={() => {
          if (selectedActionId) onConfirm(selectedActionId);
        }}
      >
        선택 확정
      </button>
    </div>
  );
}
