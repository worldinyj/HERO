import { BARRIER_CARDS } from "@hero/engine";
import { useEffect, useMemo, useState } from "react";
import { useAudio } from "../../audio/AudioContext";

export function BarrierCardTray({
  availableCardIds,
  allowedCardIds,
  onUse,
}: {
  availableCardIds: string[];
  allowedCardIds: string[] | undefined;
  onUse: (cardId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { manager: audioManager } = useAudio();
  const [lastUsedCard, setLastUsedCard] = useState<string | null>(null);

  const cards = useMemo(
    () =>
      availableCardIds
        .filter(
          (cardId) =>
            (!allowedCardIds || allowedCardIds.includes(cardId)) &&
            Boolean(BARRIER_CARDS[cardId]),
        )
        .map((cardId) => BARRIER_CARDS[cardId])
        .filter((card): card is NonNullable<typeof card> => card !== undefined),
    [allowedCardIds, availableCardIds],
  );

  useEffect(() => {
    if (!lastUsedCard) return;

    const timer = window.setTimeout(() => {
      setLastUsedCard(null);
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [lastUsedCard]);

  if (cards.length === 0 && !lastUsedCard) {
    return null;
  }

  return (
    <section className="decision-section barrier-tray">
      <button
        type="button"
        className="barrier-tray-toggle"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>방어막 카드</span>
        <strong>{cards.length}</strong>
        <small>{open ? "접기" : "펼치기"}</small>
      </button>

      {lastUsedCard ? (
        <p className="barrier-use-feedback" role="status">
          {BARRIER_CARDS[lastUsedCard]?.label ?? lastUsedCard} 방어막을 적용했습니다.
        </p>
      ) : null}

      {open && cards.length > 0 ? (
        <div className="card-tray card-tray--expanded">
          {cards.map((card) => (
            <button
              key={card.id}
              type="button"
              className="card-button"
              onClick={() => {
                setLastUsedCard(card.id);
                void audioManager.playSfx("SFX-04");
                onUse(card.id);
              }}
            >
              <span>{card.label}</span>
              <small>+{card.timeCostMin}분</small>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
