import { useEffect, useMemo, useState } from "react";
import { useDialogueDucking } from "../audio/AudioContext";

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined" || !("matchMedia" in window)) {
      return false;
    }

    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !("matchMedia" in window)) {
      return;
    }

    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = () => setReduced(query.matches);
    handleChange();
    query.addEventListener("change", handleChange);

    return () => query.removeEventListener("change", handleChange);
  }, []);

  return reduced;
}

export function DialogueBox({
  text,
  nodeKey,
  onContinue,
}: {
  text: string;
  nodeKey: string;
  onContinue: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const characters = useMemo(() => Array.from(text), [text]);
  const [visibleCount, setVisibleCount] = useState(
    reducedMotion ? characters.length : 0,
  );

  useEffect(() => {
    setVisibleCount(reducedMotion ? characters.length : 0);
  }, [characters.length, nodeKey, reducedMotion]);

  useEffect(() => {
    if (reducedMotion || visibleCount >= characters.length) return;

    const timer = window.setTimeout(() => {
      setVisibleCount((current) => Math.min(current + 1, characters.length));
    }, 24);

    return () => window.clearTimeout(timer);
  }, [characters.length, reducedMotion, visibleCount]);

  const complete = visibleCount >= characters.length;
  const visibleText = characters.slice(0, visibleCount).join("");

  function advance() {
    if (!complete) {
      setVisibleCount(characters.length);
      return;
    }

    onContinue();
  }

  return (
    <>
      <button
        type="button"
        className="dialogue-box"
        aria-label={text}
        onClick={advance}
      >
        <span className="dialogue-visible" aria-hidden="true">
          {visibleText}
          {!complete ? <span className="typing-cursor" aria-hidden="true">▌</span> : null}
        </span>
      </button>

      <button
        className="primary-button"
        type="button"
        onClick={advance}
      >
        {complete ? "계속" : "전체 보기"}
      </button>
    </>
  );
}

export function SceneStage({
  nodeKey,
  speaker,
  text,
  tone = "scene",
  onContinue,
}: {
  nodeKey: string;
  speaker?: string | undefined;
  text: string;
  tone?: "scene" | "event";
  onContinue: () => void;
}) {
  useDialogueDucking(true);

  return (
    <article
      className={tone === "event" ? "scene-stage scene-stage--event" : "scene-stage"}
    >
      <div className="scene-stage-visual" aria-hidden="true">
        <span>{tone === "event" ? "!" : "HERO"}</span>
      </div>

      <div className="scene-stage-copy">
        <p className="eyebrow">
          {tone === "event" ? "상황 변화" : speaker ?? "상황"}
        </p>

        <DialogueBox
          key={nodeKey}
          nodeKey={nodeKey}
          text={text}
          onContinue={onContinue}
        />
      </div>
    </article>
  );
}
