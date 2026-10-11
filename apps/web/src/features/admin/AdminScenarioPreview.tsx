import { act, createGame, evaluate, getView, isFinished, type GameAction } from "@hero/engine";
import type { Scenario } from "@hero/schema";
import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { GameClock } from "../play/GameClock";
import { PlayNodeStage } from "../play/components/PlayNodeStage";
import { EndingStamp } from "../play/components/EndingStamp";
import { IncidentDebrief } from "../play/result/IncidentDebrief";

function initialGame(scenario: Scenario) {
  return createGame(scenario, {
    simulationSeed: `admin-preview:${scenario.id}:v${scenario.version}`,
    presentationSeed: `admin-preview:${scenario.id}:v${scenario.version}:presentation`,
  });
}

interface PreviewProps {
  scenario: Scenario; sourceLabel: string; onClose: () => void;
}

class PreviewBoundary extends Component<{ children: ReactNode; onClose: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <section className="panel"><p className="error-text" role="alert">미리보기를 실행하지 못했습니다. 자동 장면 연결과 시나리오 내용을 확인해주세요.</p><button type="button" className="text-button" onClick={this.props.onClose}>미리보기 닫기</button></section> : this.props.children;
  }
}

/** In-memory review only: no game store, persistence, session or submission API. */
export function AdminScenarioPreview(props: PreviewProps) {
  return <PreviewBoundary onClose={props.onClose}><PreviewPlayer {...props} /></PreviewBoundary>;
}

function PreviewPlayer({ scenario, sourceLabel, onClose }: PreviewProps) {
  const [game, setGame] = useState(() => initialGame(scenario));
  const [playthrough, setPlaythrough] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const view = getView(scenario, game);
  const finished = isFinished(scenario, game);
  const result = finished ? evaluate(scenario, game, { reflectionAnswered: false, swissCheeseViewed: false }) : null;

  function dispatch(action: GameAction) {
    try { setGame(act(scenario, game, action)); setError(null); }
    catch { setError("선택한 행동을 처리하지 못했습니다. 처음부터 다시 확인해주세요."); }
  }

  return (
    <section className="panel admin-preview-player" aria-labelledby="admin-preview-title">
      <p className="eyebrow">Scenario Preview</p>
      <h3 id="admin-preview-title" ref={heading} tabIndex={-1}>{scenario.title} · 미리보기</h3>
      <p className="muted mini-copy">{sourceLabel} · v{scenario.version}</p>
      {sourceLabel.startsWith("입력 중") ? <p className="muted mini-copy">JSON을 수정했다면 ‘입력한 JSON 미리보기’를 다시 눌러 수정 내용을 확인해주세요.</p> : null}
      <p className="notice">검토용 플레이입니다. 학습기록·HP·순위에 반영되지 않으며, 미리보기는 승인이나 게시를 대신하지 않습니다.</p>
      <div className="admin-preview-toolbar">
        <GameClock clockMin={view.clockMin} deadlineMin={view.deadlineMin} />
        <button type="button" className="secondary-button compact-button" onClick={() => { setGame(initialGame(scenario)); setPlaythrough(value => value + 1); setError(null); }}>처음부터 다시 보기</button>
        <button type="button" className="text-button" onClick={onClose}>미리보기 닫기</button>
      </div>
      {error ? <p className="error-text" role="alert">{error}</p> : null}
      {result ? (
        <>
          <EndingStamp ending={result.ending} />
          {view.node.type === "ending" ? <div className="review-card"><h4>{view.node.title}</h4><p>{view.node.summary}</p></div> : null}
          <p className="muted">이 결과는 검토용입니다. 다른 선택 경로는 ‘처음부터 다시 보기’로 확인할 수 있습니다.</p>
          <IncidentDebrief scenario={scenario} game={game} replayEnabled={false} onReplay={() => {}} />
        </>
      ) : <PlayNodeStage key={`${playthrough}:${game.nodeId}`} scenarioId={scenario.id} scenarioVersion={scenario.version} view={view} onAction={dispatch} />}
    </section>
  );
}
