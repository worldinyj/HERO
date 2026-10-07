import { getScenarioById } from "@hero/content";
import {
  evaluate,
  getView,
  isFinished,
} from "@hero/engine";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { CompetitiveGamePage } from "./CompetitiveGamePage";
import { EndingStamp } from "./components/EndingStamp";
import { GameClock } from "./components/GameClock";
import { PlayNodeStage } from "./components/PlayNodeStage";
import { CausalReflection } from "./result/CausalReflection";
import { HpReview } from "./result/HpReview";
import { SwissCheeseTimeline } from "./result/SwissCheeseTimeline";
import { useTutorialGameStore } from "./gameStore";

type ReviewStage = "ending" | "reflection" | "timeline" | "review";

export function GamePage() {
  const { scenarioId = "" } = useParams();
  const scenario = getScenarioById(scenarioId);
  const game = useTutorialGameStore((state) => state.game);
  const previousBestMetricAvg = useTutorialGameStore(
    (state) => state.previousBestMetricAvg,
  );
  const hydratedScenarioId = useTutorialGameStore(
    (state) => state.hydratedScenarioId,
  );
  const hydrating = useTutorialGameStore((state) => state.hydrating);
  const start = useTutorialGameStore((state) => state.start);
  const hydrate = useTutorialGameStore((state) => state.hydrate);
  const dispatch = useTutorialGameStore((state) => state.dispatch);
  const replayAt = useTutorialGameStore((state) => state.replayAt);
  const reset = useTutorialGameStore((state) => state.reset);

  const [online, setOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );
  const [reviewStage, setReviewStage] = useState<ReviewStage>("ending");
  const [reflectionSelection, setReflectionSelection] = useState<string | null>(
    null,
  );
  const [reflectionAnswered, setReflectionAnswered] = useState(false);
  const [swissCheeseViewed, setSwissCheeseViewed] = useState(false);

  useEffect(() => {
    function handleOnline() {
      setOnline(true);
    }

    function handleOffline() {
      setOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!scenario) return;

    if (hydratedScenarioId !== scenario.id) {
      if (!hydrating) {
        void hydrate(scenario);
      }
      return;
    }

    if (!game && online && !hydrating) {
      start(scenario);
    }
  }, [
    game,
    hydrate,
    hydratedScenarioId,
    hydrating,
    online,
    scenario,
    start,
  ]);


  const view = useMemo(() => {
    if (!scenario || !game) return null;
    return getView(scenario, game);
  }, [game, scenario]);

  function resetReviewState() {
    setReviewStage("ending");
    setReflectionSelection(null);
    setReflectionAnswered(false);
    setSwissCheeseViewed(false);
  }

  function handleReplay(nodeId: string) {
    if (!scenario) return;
    replayAt(scenario, nodeId);
    resetReviewState();
  }

  function handleRestart() {
    if (!scenario) return;
    reset();
    start(scenario);
    resetReviewState();
  }

  if (!scenario) {
    return <CompetitiveGamePage scenarioId={scenarioId} />;
  }

  if (!game || !view) {
    if (hydrating || hydratedScenarioId !== scenario.id) {
      return (
        <section className="panel">
          <p className="eyebrow">Resume</p>
          <h2>저장된 플레이를 확인하고 있습니다</h2>
          <p className="muted">이 기기에 저장된 진행 상태가 있으면 이어서 시작합니다.</p>
        </section>
      );
    }

    if (!online) {
      return (
        <section className="panel offline-start-panel">
          <p className="eyebrow">Offline</p>
          <h2>새 플레이는 온라인 연결이 필요합니다</h2>
          <p className="muted">
            이미 시작해 저장된 세션은 오프라인에서도 이어갈 수 있습니다.
            연결이 복구되면 자동으로 시작됩니다.
          </p>
          <Link className="text-link" to="/">캠페인으로 돌아가기</Link>
        </section>
      );
    }

    return (
      <section className="panel">
        <p className="muted">튜토리얼을 준비하고 있습니다…</p>
      </section>
    );
  }

  const node = view.node;
  const finished = isFinished(scenario, game);

  if (finished && node.type === "ending") {
    const evaluation = evaluate(scenario, game, {
      reflectionAnswered,
      swissCheeseViewed,
      ...(previousBestMetricAvg === null
        ? {}
        : { previousBestMetricAvg }),
    });

    return (
      <section className="game-page" aria-live="polite">
        <GameClock label="0장 튜토리얼" clockMin={view.clockMin} />

        {!online ? (
          <div className="offline-banner" role="status">
            오프라인 · 현재 플레이는 이 기기에 자동저장됩니다.
          </div>
        ) : null}

        {reviewStage === "ending" ? (
          <article className="ending-card">
            <p className="eyebrow">Training Result</p>
            <h2>{node.title}</h2>
            <EndingStamp ending={node.ending} />
            <p>{node.summary}</p>

            <div className="tutorial-score">
              <div>
                <span>학습행동 평균</span>
                <strong>{Math.round(evaluation.metricAverage)}</strong>
              </div>
              <div>
                <span>회고 전 HP</span>
                <strong>{evaluation.hpPoint}</strong>
              </div>
            </div>

            <p className="review-note">
              다음 화면부터는 결과의 책임을 한 사람에게 돌리지 않고, 어떤 조건과
              방어막이 겹쳤는지 순서대로 돌아봅니다.
            </p>

            <button
              type="button"
              className="primary-button"
              onClick={() => setReviewStage("reflection")}
            >
              결과 돌아보기
            </button>
          </article>
        ) : null}

        {reviewStage === "reflection" ? (
          <CausalReflection
            scenario={scenario}
            game={game}
            selected={reflectionSelection}
            onSelect={setReflectionSelection}
            onContinue={() => {
              setReflectionAnswered(true);
              setReviewStage("timeline");
            }}
          />
        ) : null}

        {reviewStage === "timeline" ? (
          <SwissCheeseTimeline
            scenario={scenario}
            game={game}
            onReplay={handleReplay}
            onContinue={() => {
              setSwissCheeseViewed(true);
              setReviewStage("review");
            }}
          />
        ) : null}

        {reviewStage === "review" ? (
          <HpReview
            scenario={scenario}
            game={game}
            evaluation={evaluate(scenario, game, {
              reflectionAnswered: true,
              swissCheeseViewed: true,
              ...(previousBestMetricAvg === null
                ? {}
                : { previousBestMetricAvg }),
            })}
            onReplay={handleReplay}
            onRestart={handleRestart}
          />
        ) : null}
      </section>
    );
  }

  return (
    <section className="game-page" aria-live="polite">
      <GameClock
        label={`0장 · ${scenario.defaultPerspectiveRole}`}
        clockMin={view.clockMin}
        deadlineMin={view.deadlineMin}
      />

      {!online ? (
        <div className="offline-banner" role="status">
          오프라인 · 진행 상태를 이 기기에 저장하고 있습니다.
        </div>
      ) : null}

      <PlayNodeStage
        view={view}
        onAction={(action) => dispatch(scenario, action)}
      />
    </section>
  );
}
