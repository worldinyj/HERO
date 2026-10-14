import { act, BARRIER_CARDS, createGame, getView, type GameAction, type GameState } from "@hero/engine";
import { ScenarioSchema } from "@hero/schema";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import raw from "../../../../../scenarios/data/S02_equipment_identity_v1.json";
import { ChoiceSheet } from "../play/ChoiceSheet";
import { GameClock } from "../play/GameClock";
import "./exploration.css";

const scenario = ScenarioSchema.parse(raw);
if (scenario.id !== "s02_equipment_identity" || scenario.version !== 4) throw new Error("exploration_requires_reviewed_s02_v4");
type Target = "panel" | "document" | "colleague" | "contact" | "decision";
const labels: Record<Target, string> = { panel: "현장 패널", document: "작업 문서", colleague: "동료", contact: "연락 수단", decision: "다음 행동 결정" };
const cardAt: Record<string, Target> = { self_check_star: "panel", independent_verification: "colleague", stop_when_unsure: "contact" };
const cardLabel: Record<string, string> = { self_check_star: "멈추고 자기확인하기 · STAR", independent_verification: "별도 근거로 독립확인 요청하기", stop_when_unsure: "작업 중지 후 확인 요청하기" };
const questions = ["현장에서 직접 조사한다는 느낌이 들었나요?", "발견한 정보 때문에 처음 생각을 바꿨나요?", "다른 순서나 방법으로 다시 확인해 보고 싶나요?"];
function startGame() {
  return createGame(scenario, { simulationSeed: "s02-exploration-v4", presentationSeed: "s02-exploration-v4" });
}
function notes(game: GameState) {
  return game.log.flatMap(entry => {
    const node = scenario.nodes[entry.nodeId];
    if (entry.actionType !== "info" || node?.type !== "decision") return [];
    const info = node.infoActions.find(info => info.actionId === entry.actionId);
    return info ? [{ id: `${entry.nodeId}:${info.actionId}`, text: info.revealText }] : [];
  });
}
function history(game: GameState) {
  return game.log.flatMap(entry => {
    const node = scenario.nodes[entry.nodeId];
    const label = entry.actionType === "card" ? cardLabel[entry.actionId ?? ""]
      : node?.type === "decision" && entry.actionType === "choice" ? node.choices.find(choice => choice.actionId === entry.actionId)?.label
      : node?.type === "decision" && entry.actionType === "info" ? node.infoActions.find(info => info.actionId === entry.actionId)?.label : null;
    return label ? [{ step: entry.step, label, minutes: entry.clockAfter - entry.clockBefore }] : [];
  });
}

const closeups: Record<Target, string> = { panel: "24 24 205 210", document: "220 126 165 152", colleague: "405 64 113 221", contact: "536 30 78 114", decision: "0 0 640 340" };
function RoomIllustration({ target }: { target?: Target }) {
  return <svg viewBox={target ? closeups[target] : "0 0 640 340"} aria-hidden="true" focusable="false">
          <path d="M0 0H640V250L320 340L0 250Z" fill="#192c41"/><path d="M0 250L320 340L640 250" fill="none" stroke="#6c8398" strokeWidth="2"/>
          <rect x="34" y="34" width="180" height="190" rx="12" fill="#314b64" stroke="#9cb5c9" strokeWidth="3"/>
          <rect x="54" y="58" width="140" height="50" rx="5" fill="#0e1c2c"/>
          <g fill="#a0b5c5">{[66,106,146].map(x => <circle key={x} cx={x} cy="139" r="11"/>)}<rect x="57" y="165" width="128" height="20" rx="4"/></g>
          <path d="M242 164L360 164L380 212L220 212Z" fill="#8b775c"/><path d="M240 212V267M360 212V267" stroke="#b8a17f" strokeWidth="7"/>
          <rect x="266" y="136" width="69" height="66" rx="4" fill="#e7e0ce" transform="rotate(9 266 136)"/>
          <path d="M279 153L317 158M277 167L315 172M275 181L311 186" stroke="#73828d" strokeWidth="4"/>
          <circle cx="461" cy="94" r="25" fill="#ccb28e"/><path d="M426 132Q461 112 496 132L502 211H420Z" fill="#eab65c"/><path d="M440 210L434 273M480 210L486 273" stroke="#91a5ba" strokeWidth="18"/>
          <rect x="551" y="42" width="48" height="85" rx="10" fill="#506e86" stroke="#b1c5d6" strokeWidth="3"/><path d="M565 60V102M583 59V74" stroke="#d0dce3" strokeWidth="6"/>
        </svg>;
}

/** Separate in-memory excerpt. Never uses the competitive/tutorial game stores or submission APIs. */
export function ExplorationPage() {
  const [game, setGame] = useState(startGame);
  const [done, setDone] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [responses, setResponses] = useState(["", "", ""]);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const pageHeading = useRef<HTMLHeadingElement>(null);
  const targetRefs = useRef<Partial<Record<Target, HTMLButtonElement | null>>>({});
  const view = getView(scenario, game);
  const node = view.node;
  const memo = notes(game);
  useEffect(() => { if (target) detailHeading.current?.focus(); }, [target]);
  useEffect(() => { pageHeading.current?.focus(); }, [game.nodeId, done]);
  function open(next: Target) { setSelectedChoice(null); setTarget(next); }
  function close() { const previous = target; setTarget(null); setSelectedChoice(null); if (previous) targetRefs.current[previous]?.focus(); }
  function dispatch(action: GameAction) {
    try {
      const next = act(scenario, game, action);
      setGame(next); setError(null);
      if (action.type === "choice") {
        setTarget(null); setSelectedChoice(null);
        if (game.nodeId === "decision_verify") setDone(true);
      }
    } catch { setError("현재 사용할 수 없는 행동입니다. 다른 확인 행동을 살펴보세요."); }
  }
  function restart() { setGame(startGame()); setDone(false); setTarget(null); setSelectedChoice(null); setResponses(["", "", ""]); setError(null); }
  return <section className="panel exploration-page" aria-labelledby="exploration-title">
    <p className="eyebrow">Field exploration · S02 v4</p>
    <h2 id="exploration-title" ref={pageHeading} tabIndex={-1}>{done ? "확인과 판단 돌아보기" : "탐색형 체험 · 아마 이 설비가 맞을 겁니다"}</h2>
    <p className="notice">약 5분 · S02의 식별·확인 구간을 발췌한 별도 체험입니다. HP·순위·학습기록에 반영되지 않습니다. 입력과 진행은 저장되지 않으며 새로고침하면 초기화됩니다.</p>
    {error ? <p role="alert" className="error-text">{error}</p> : null}
    <div className="exploration-toolbar"><GameClock clockMin={view.clockMin} deadlineMin={view.deadlineMin} /><Link className="text-link" to="/">캠페인으로</Link></div>
    {done ? <>
      <p>작업의 실제 결과를 재현하거나 정답을 채점하는 화면이 아닙니다. 무엇을 확인하고 어떤 방벽으로 판단했는지 돌아보세요.</p>
      <h3>현장 메모</h3>
      {memo.length ? <ul>{memo.map(note => <li key={note.id}>{note.text}</li>)}</ul> : <p>추가 정보 확인으로 확보한 단서는 없습니다. 어떤 근거로 판단했는지 돌아보세요.</p>}
      <h3>나의 확인과 판단 순서</h3>
      <ol>{history(game).map(item => <li key={item.step}>{item.label} <small>· {item.minutes}분</small></li>)}</ol>
      <p className="notice">표시·설계가 식별을 도왔는지, 별도의 확인 근거와 조직의 지원이 있었는지 함께 살펴보세요. 동료에게 대상을 여는 것만으로 독립확인이 이루어지지는 않습니다.</p>
      <div className="exploration-feedback"><h3>체험을 돌아보기</h3><p className="muted">답변은 이 화면에서만 작성하며 전송·저장되지 않습니다.</p>{questions.map((question, index) => <label key={question}>{question}<textarea maxLength={1000} value={responses[index]} onChange={event => setResponses(current => current.map((value, at) => at === index ? event.target.value : value))} /></label>)}</div>
      <button className="primary-button" onClick={restart}>다시 해보기</button>
    </> : node.type === "scene" ? <article className="review-card"><h3>{game.nodeId === "intro" ? "짧은 브리핑" : "확인 후의 상황"}</h3><p>{node.text}</p><p className="muted">화면 속 대상을 여는 것은 무료입니다. 시간을 표시한 행동을 실행할 때만 게임 시간이 흐릅니다.</p><button className="primary-button" onClick={() => dispatch({ type: "continue" })}>{game.nodeId === "intro" ? "현장 탐색 시작" : "다음 확인으로"}</button></article>
    : node.type === "decision" ? <>
      <p className="eyebrow">{game.nodeId === "decision_identify" ? "1 / 2 · 식별" : "2 / 2 · 확인"}</p><p>{node.prompt}</p>
      <div className="exploration-room" role="group" aria-label="기기실 조사 대상">
        <RoomIllustration />
        {(["panel", "document", "colleague", "contact"] as Target[]).map(id => <button key={id} ref={element => { targetRefs.current[id] = element; }} className={`exploration-hotspot exploration-hotspot--${id}`} aria-expanded={target === id} aria-controls="exploration-detail" onClick={() => open(id)}>{labels[id]}<small>열어 살펴보기</small></button>)}
      </div>
      <p className="muted mini-copy">실제 설비를 복제하지 않은 교육용 공간입니다. 대상을 열거나 메모를 다시 읽어도 시간이 늘어나지 않습니다.</p>
      <button ref={element => { targetRefs.current.decision = element; }} className="primary-button" aria-expanded={target === "decision"} aria-controls="exploration-detail" onClick={() => open("decision")}>다음 행동 결정</button>
      {target ? <article id="exploration-detail" className="exploration-detail" onKeyDown={event => { if (event.key === "Escape") close(); }}>
        <h3 ref={detailHeading} tabIndex={-1}>{labels[target]}</h3><button className="text-button" onClick={close}>현장으로 돌아가기</button>
        {target === "decision" ? <><p>모든 대상을 조사할 필요는 없습니다. 지금 확보한 근거와 남은 불확실성으로 판단하세요.</p>{memo.length ? <ul>{memo.map(note => <li key={note.id}>{note.text}</li>)}</ul> : <p>확보한 추가 단서 없음</p>}<ChoiceSheet choices={node.choices} selectedActionId={selectedChoice} onSelect={setSelectedChoice} onConfirm={actionId => dispatch({ type: "choice", actionId })} /></>
        : <>
          <div className={`exploration-closeup exploration-closeup--${target}`} aria-hidden="true"><RoomIllustration target={target} /></div>
          {target === "colleague" ? <p>대화 화면을 여는 것과 독립확인은 다릅니다. 다른 사람에게 첫 판단을 따라 달라고 하는 대신 별도 근거로 확인을 요청합니다.</p> : target === "contact" ? <p>불확실성을 공유하고 작업 중지 후 확인 지원을 요청할 수 있습니다.</p> : <p>조작을 실행하지 않고 확인할 근거를 살펴봅니다.</p>}
          {node.infoActions.filter(info => target === (info.actionId === "observe_status_layout" ? "panel" : "document")).map(info => {
            const used = game.usedInfoActions.includes(`${game.nodeId}:${info.actionId}`);
            return <div key={info.actionId}>{used ? <p className="info-reveal">{info.revealText}</p> : null}<button className="secondary-button" disabled={used} onClick={() => dispatch({ type: "info", actionId: info.actionId })}>{used ? "확인 완료 · 다시 읽기 무료" : `${info.label} · ${info.timeCostMin}분`}</button></div>;
          })}
          {Object.entries(cardAt).filter(([id, at]) => at === target && node.allowedCards?.includes(id)).map(([id]) => <button key={id} className="secondary-button" disabled={!view.cardsAvailable.includes(id)} onClick={() => dispatch({ type: "card", cardId: id })}>{cardLabel[id]} · {BARRIER_CARDS[id]?.timeCostMin}분{game.cardsUsed.includes(id) ? " · 사용 완료" : ""}</button>)}
          {target === "document" && game.nodeId === "decision_identify" ? <p className="muted">문서와의 대조는 ‘다음 행동 결정’에서 선택할 수 있습니다. 작업경계에 대한 추가 정보 확인은 다음 확인 단계에서 제공됩니다.</p> : null}
          {(target === "colleague" || target === "contact") && game.nodeId === "decision_identify" ? <p className="muted">독립확인과 중지·지원 요청 방벽은 다음 확인 단계에서 사용할 수 있습니다.</p> : null}
        </>}
      </article> : null}
      <aside className="exploration-notes" aria-labelledby="field-notes-title"><h3 id="field-notes-title">현장 메모</h3>{memo.length ? <ul>{memo.map(note => <li key={note.id}>{note.text}</li>)}</ul> : <p>확인 행동으로 확보한 단서가 여기에 모입니다.</p>}<p className="muted mini-copy">메모는 확보한 정보이며 안전한 진행을 보장하는 판정은 아닙니다.</p></aside>
    </> : null}
  </section>;
}
