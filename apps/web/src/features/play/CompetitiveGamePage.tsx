import {
  act,
  createGame,
  evaluate,
  getView,
  isFinished,
  replayFrom,
  type Evaluation,
  type GameAction,
  type GameState,
} from "@hero/engine";
import { ScenarioSchema, type Scenario } from "@hero/schema";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "../auth/AuthContext";
import {
  clearInvalidCompetitiveSession,
  loadCompetitiveSession,
  saveCompetitiveSession,
  updateCompetitiveSessionProgress,
  type CompetitiveServerSession,
} from "../../lib/competitivePersistence";
import { getSupabase } from "../../lib/supabase";
import { shouldRetryQueuedOnReconnect } from "../../lib/submissionReceipt";
import { isRestorableCompetitiveSession } from "../../lib/competitiveCacheValidation";
import {
  gameLogToSubmissionActions,
  submitSessionWithQueue,
} from "../../lib/submissionQueue";
import { GameClock } from "./GameClock";
import { EndingStamp } from "./components/EndingStamp";
import { PlayNodeStage } from "./components/PlayNodeStage";
import { restoreReplayPrefix, type StoredDecisionRow } from "./competitiveReplay";
import { CausalReflection } from "./result/CausalReflection";
import { HpReview } from "./result/HpReview";
import { IncidentDebrief } from "./result/IncidentDebrief";
import { SwissCheeseTimeline } from "./result/SwissCheeseTimeline";

type ReviewStage = "ending" | "reflection" | "timeline" | "review" | "incident";
type SubmissionState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "submitted"; evaluation: Evaluation | null; cleanupPending: boolean }
  | { status: "queued"; reason: string }
  | { status: "rejected"; reason: string };

interface StartSessionResponse {
  resumed?: boolean;
  sessionId?: string;
  seasonId?: string;
  seasonKey?: string;
  scenarioId?: string;
  scenarioVersionId?: string;
  scenarioVersion?: number;
  scenario?: unknown;
  simulationSeed?: string;
  presentationSeed?: string;
  perspectiveRole?: string;
  replayOf?: string | null;
  replayFromNode?: string | null;
  startedAt?: string;
  error?: string;
}

function serverEvaluation(data: unknown): Evaluation | null {
  if (!data || typeof data !== "object" || !("evaluation" in data)) {
    return null;
  }

  const candidate = (data as { evaluation?: unknown }).evaluation;
  if (
    !candidate ||
    typeof candidate !== "object" ||
    !("hpPoint" in candidate) ||
    typeof (candidate as { hpPoint?: unknown }).hpPoint !== "number"
  ) {
    return null;
  }

  return candidate as Evaluation;
}

function startSessionError(data: unknown, fallback: string): string {
  if (
    data &&
    typeof data === "object" &&
    "error" in data &&
    typeof (data as { error?: unknown }).error === "string"
  ) {
    return String((data as { error: string }).error);
  }

  return fallback;
}

export function CompetitiveGamePage({
  scenarioId,
}: {
  scenarioId: string;
}) {
  const { session, profile } = useAuth();
  const userId = session?.user.id ?? null;

  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [server, setServer] = useState<CompetitiveServerSession | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [online, setOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );
  const [reviewStage, setReviewStage] = useState<ReviewStage>("ending");
  const [reflectionSelection, setReflectionSelection] = useState<string | null>(
    null,
  );
  const [reflectionAnswered, setReflectionAnswered] = useState(false);
  const [swissCheeseViewed, setSwissCheeseViewed] = useState(false);
  const [submission, setSubmission] = useState<SubmissionState>({
    status: "idle",
  });
  const submissionInFlightRef = useRef<string | null>(null);
  const [replayStarting, setReplayStarting] = useState(false);
  const [replayError, setReplayError] = useState<string | null>(null);

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
    if (!userId || profile?.role !== "player") {
      setLoading(false);
      return;
    }

    let active = true;

    void (async () => {
      setLoading(true);
      setLoadError(null);

      try {
        const saved = await loadCompetitiveSession(userId, scenarioId);

        if (isRestorableCompetitiveSession(saved, userId, scenarioId)) {
          if (!active) return;
          setScenario(saved.scenario);
          setServer({
            ...saved.server,
            replayOf: saved.server.replayOf ?? null,
            replayFromNode: saved.server.replayFromNode ?? null,
            submissionLogStart: Number.isInteger(saved.server.submissionLogStart)
              ? saved.server.submissionLogStart
              : 0,
          });
          setGame(saved.game);
          setLoading(false);
          return;
        }

        if (saved) {
          if (!active) return;
          const removed = await clearInvalidCompetitiveSession(userId, scenarioId);
          if (!active) return;
          if (!removed) {
            // Another tab replaced the malformed snapshot with a newer
            // valid play. Never proceed with a stale start-session response.
            throw new Error("competitive_session_cache_superseded");
          }
        }

        if (!online) {
          if (!active) return;
          setLoadError("offline_new_session");
          setLoading(false);
          return;
        }

        const supabase = getSupabase();
        const { data, error } = await supabase.functions.invoke(
          "start-session",
          { body: { scenarioId } },
        );

        if (error) {
          throw new Error(startSessionError(data, error.message));
        }

        const response = data as StartSessionResponse;
        if (
          !response.sessionId ||
          !response.seasonId ||
          !response.seasonKey ||
          !response.scenarioVersionId ||
          typeof response.scenarioVersion !== "number" ||
          !response.simulationSeed ||
          !response.presentationSeed ||
          !response.perspectiveRole ||
          !response.startedAt
        ) {
          throw new Error(
            startSessionError(response, "invalid_start_session_response"),
          );
        }

        const parsed = ScenarioSchema.safeParse(response.scenario);
        if (!parsed.success) {
          throw new Error("server_scenario_schema_invalid");
        }

        if (
          parsed.data.id !== scenarioId ||
          parsed.data.version !== response.scenarioVersion
        ) {
          throw new Error("server_scenario_identity_mismatch");
        }

        const replayOf = response.replayOf ?? null;
        const replayFromNode = response.replayFromNode ?? null;

        if (Boolean(replayOf) !== Boolean(replayFromNode)) {
          throw new Error("invalid_replay_session_metadata");
        }

        let nextGame: GameState;
        let submissionLogStart = 0;

        if (replayOf && replayFromNode) {
          const { data: sourceDecisions, error: sourceDecisionError } =
            await supabase
              .from("session_decisions")
              .select("action_type, action_id")
              .eq("session_id", replayOf)
              .order("seq", { ascending: true });

          if (sourceDecisionError) {
            throw sourceDecisionError;
          }

          nextGame = restoreReplayPrefix(
            parsed.data,
            {
              simulationSeed: response.simulationSeed,
              presentationSeed: response.presentationSeed,
            },
            (sourceDecisions ?? []) as StoredDecisionRow[],
            replayFromNode,
          );
          submissionLogStart = nextGame.log.length;
        } else {
          nextGame = createGame(parsed.data, {
            simulationSeed: response.simulationSeed,
            presentationSeed: response.presentationSeed,
          });
        }

        const nextServer: CompetitiveServerSession = {
          sessionId: response.sessionId,
          seasonId: response.seasonId,
          seasonKey: response.seasonKey,
          scenarioVersionId: response.scenarioVersionId,
          scenarioVersion: response.scenarioVersion,
          perspectiveRole: response.perspectiveRole,
          startedAt: response.startedAt,
          replayOf,
          replayFromNode,
          submissionLogStart,
        };

        if (!active) return;
        const initialized = await saveCompetitiveSession({
          userId,
          scenarioId,
          scenarioVersion: parsed.data.version,
          scenario: parsed.data,
          server: nextServer,
          game: nextGame,
        });
        if (!initialized) {
          if (!active) return;
          throw new Error("competitive_session_cache_superseded");
        }
        if (!active) return;
        setScenario(parsed.data);
        setServer(nextServer);
        setGame(nextGame);
        setLoading(false);
      } catch (cause) {
        if (!active) return;
        setLoadError(
          cause instanceof Error ? cause.message : "competitive_session_failed",
        );
        setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [online, profile?.role, scenarioId, userId]);

  const view = useMemo(() => {
    if (!scenario || !game) return null;
    return getView(scenario, game);
  }, [game, scenario]);

  async function persist(nextGame: GameState) {
    if (!scenario || !server || !userId) return;

    await updateCompetitiveSessionProgress({
      userId,
      scenarioId,
      scenarioVersion: scenario.version,
      scenario,
      server,
      game: nextGame,
    });
  }

  function dispatch(action: GameAction) {
    if (!scenario || !game) return;

    const nextGame = act(scenario, game, action);
    setGame(nextGame);
    void persist(nextGame).catch(() => {
      // An already-started play remains usable even if persistence fails.
    });
  }

  async function submitFinishedGame() {
    if (!scenario || !server || !game || !userId) return;
    if (!isFinished(scenario, game)) return;
    // A second click/reconnect event must not downgrade a confirmed result.
    if (submissionInFlightRef.current === server.sessionId ||
        submission.status === "submitted") return;
    submissionInFlightRef.current = server.sessionId;

    setSubmission({ status: "submitting" });

    try {
      const result = await submitSessionWithQueue({
        scenarioId,
        body: {
          sessionId: server.sessionId,
          actions: gameLogToSubmissionActions(game.log, server.submissionLogStart),
          reflectionAnswered: true,
          swissCheeseViewed: true,
        },
      });

      if (result.status === "submitted") {
        setSubmission({
          status: "submitted",
          evaluation: serverEvaluation(result.data),
          cleanupPending: result.cleanupPending,
        });
        // Queue service cleared only a matching server-confirmed game.
        // A newer replay written by another tab must remain untouched.
        return;
      }

      if (result.status === "queued") {
        setSubmission({ status: "queued", reason: result.reason });
        return;
      }

      setSubmission({ status: "rejected", reason: result.reason });
    } catch (cause) {
      // A broken/unavailable IndexedDB queue is NOT a durable retry.
      // Keep the in-memory game untouched and let the player retry here.
      setSubmission({
        status: "rejected",
        reason: cause instanceof Error ? cause.message : "submission_queue_failed",
      });
    } finally {
      if (submissionInFlightRef.current === server.sessionId) {
        submissionInFlightRef.current = null;
      }
    }
  }

  async function startReplay(nodeId: string) {
    if (
      !scenario ||
      !server ||
      !game ||
      !userId ||
      !online ||
      submission.status !== "submitted"
    ) {
      return;
    }

    setReplayStarting(true);
    setReplayError(null);

    try {
      const sourceSessionId = server.sessionId;
      const sourceLog = game.log;
      const supabase = getSupabase();

      const { data, error } = await supabase.functions.invoke(
        "start-session",
        {
          body: {
            scenarioId,
            replayOf: sourceSessionId,
            replayFromNode: nodeId,
          },
        },
      );

      if (error) {
        throw new Error(startSessionError(data, error.message));
      }

      const response = data as StartSessionResponse;
      if (
        !response.sessionId ||
        !response.seasonId ||
        !response.seasonKey ||
        !response.scenarioVersionId ||
        typeof response.scenarioVersion !== "number" ||
        !response.simulationSeed ||
        !response.presentationSeed ||
        !response.perspectiveRole ||
        !response.startedAt ||
        response.replayOf !== sourceSessionId ||
        response.replayFromNode !== nodeId
      ) {
        throw new Error(
          startSessionError(response, "invalid_replay_start_response"),
        );
      }

      const parsed = ScenarioSchema.safeParse(response.scenario);
      if (!parsed.success) {
        throw new Error("server_scenario_schema_invalid");
      }

      if (
        parsed.data.id !== scenarioId ||
        parsed.data.version !== response.scenarioVersion
      ) {
        throw new Error("server_scenario_identity_mismatch");
      }

      const nextGame = replayFrom(
        parsed.data,
        {
          simulationSeed: response.simulationSeed,
          presentationSeed: response.presentationSeed,
        },
        sourceLog,
        nodeId,
      );

      const nextServer: CompetitiveServerSession = {
        sessionId: response.sessionId,
        seasonId: response.seasonId,
        seasonKey: response.seasonKey,
        scenarioVersionId: response.scenarioVersionId,
        scenarioVersion: response.scenarioVersion,
        perspectiveRole: response.perspectiveRole,
        startedAt: response.startedAt,
        replayOf: sourceSessionId,
        replayFromNode: nodeId,
        submissionLogStart: nextGame.log.length,
      };

      const initialized = await saveCompetitiveSession({
        userId,
        scenarioId,
        scenarioVersion: parsed.data.version,
        scenario: parsed.data,
        server: nextServer,
        game: nextGame,
      });
      if (!initialized) throw new Error("competitive_session_cache_superseded");

      setScenario(parsed.data);
      setServer(nextServer);
      setGame(nextGame);
      setReviewStage("ending");
      setReflectionSelection(null);
      setReflectionAnswered(false);
      setSwissCheeseViewed(false);
      setSubmission({ status: "idle" });
    } catch (cause) {
      setReplayError(
        cause instanceof Error ? cause.message : "replay_start_failed",
      );
    } finally {
      setReplayStarting(false);
    }
  }

  // Do not re-send on every queued -> submitting -> queued cycle:
  // a suspended plant can return 403 until the Admin reactivates it.
  const previousOnline = useRef(online);
  useEffect(() => {
    const reconnect = shouldRetryQueuedOnReconnect(
      previousOnline.current, online, submission.status,
    );
    previousOnline.current = online;
    if (reconnect) void submitFinishedGame();
  }, [online, submission.status]);

  if (profile?.role !== "player") {
    return (
      <section className="panel">
        <p className="eyebrow">Competitive Scenario</p>
        <h2>사용자 플레이 전용 화면입니다</h2>
        <p className="muted">발전소담당자와 관리자는 경쟁 플레이에 참여하지 않습니다.</p>
        <Link className="text-link" to="/">캠페인으로 돌아가기</Link>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="panel">
        <p className="eyebrow">Competitive Session</p>
        <h2>세션을 준비하고 있습니다</h2>
        <p className="muted">
          저장된 진행 상태와 현재 시즌의 서버 seed를 확인합니다.
        </p>
      </section>
    );
  }

  if (!scenario || !server || !game || !view) {
    const offlineStart = loadError === "offline_new_session";

    return (
      <section className="panel">
        <p className="eyebrow">{offlineStart ? "Offline" : "Scenario unavailable"}</p>
        <h2>
          {offlineStart
            ? "새 경쟁 세션은 온라인 연결이 필요합니다"
            : "경쟁 시나리오를 시작할 수 없습니다"}
        </h2>
        <p className="muted">
          {offlineStart
            ? "이미 이 기기에 저장된 경쟁 세션은 오프라인에서도 이어갈 수 있습니다. 연결되면 자동으로 다시 확인합니다."
            : "현재 시즌에 게시·배정된 시나리오인지 확인해주세요."}
        </p>
        {loadError && !offlineStart ? (
          <p className="error-text" role="alert">
            {loadError === "competitive_session_cache_superseded"
              ? "다른 탭에서 더 최신 플레이가 저장됐습니다. 새로고침하여 최신 세션을 불러오세요."
              : loadError}
          </p>
        ) : null}
        <Link className="text-link" to="/">캠페인으로 돌아가기</Link>
      </section>
    );
  }

  const node = view.node;
  const finished = isFinished(scenario, game);

  if (finished && node.type === "ending") {
    const localEvaluation = evaluate(scenario, game, {
      reflectionAnswered,
      swissCheeseViewed,
    });

    const confirmedEvaluation =
      submission.status === "submitted" && submission.evaluation
        ? submission.evaluation
        : localEvaluation;

    return (
      <section className="game-page" aria-live="polite">
        <div className="game-status">
          <span>
            {server.seasonKey} · {server.perspectiveRole}
            {server.replayOf ? " · 리플레이" : ""}
          </span>
          <GameClock clockMin={view.clockMin} deadlineMin={view.deadlineMin} />
        </div>

        {!online ? (
          <div className="offline-banner" role="status">
            오프라인 · 완료 결과는 이 기기에 저장 후 재연결 시 자동 제출됩니다.
          </div>
        ) : null}

        {reviewStage === "ending" ? (
          <article className="ending-card">
            <p className="eyebrow">Training Result</p>
            <h2>{node.title}</h2>
            <EndingStamp ending={node.ending} />
            <p>{node.summary}</p>
            <p className="review-note">
              결과는 한 사람의 마지막 행동이 아니라 조건과 방어막의 누적을
              중심으로 돌아봅니다. 회고가 끝나면 서버가 동일 seed와 행동 로그를
              재실행해 점수를 확정합니다.
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
            replayEnabled={false}
            onContinue={() => {
              setSwissCheeseViewed(true);
              setReviewStage("review");
              void submitFinishedGame();
            }}
          />
        ) : null}

        {reviewStage === "review" ? (
          <>
            {submission.status === "submitting" ? (
              <div className="notice" role="status">
                서버가 동일 seed와 행동 로그를 다시 실행해 결과를 검증하고 있습니다.
              </div>
            ) : null}

            {submission.status === "submitted" ? (
              <div className="notice" role="status">
                서버 검증 완료 · 시즌 기록에 반영되었습니다.
              </div>
            ) : null}

            {submission.status === "submitted" && submission.cleanupPending ? (
              <div className="notice" role="status">
                서버 제출은 완료되었습니다. 다만 이 기기의 임시 기록 정리가
                지연되어 기록이 남아 있을 수 있습니다. 다시 제출할 필요는 없습니다.
              </div>
            ) : null}

            {submission.status === "queued" ? (
              <div className="offline-banner" role="status">
                {submission.reason === "plant_inactive"
                  ? "발전소 운영 중지로 제출이 보류됐습니다. 행동 기록은 이 기기의 대기 저장소에 보관됐으며, 운영이 재개되면 다시 제출할 수 있습니다."
                  : submission.reason === "confirmed_cleanup_pending"
                    ? "서버 완료 기록은 있으나 저장된 결과 영수증을 복원할 수 없습니다. 중복 전송을 방지하기 위해 자동 재제출하지 않습니다. 관리자 확인이 필요합니다."
                    : "제출 대기 중 · 인터넷 연결이 복구되면 재전송을 시도합니다."}
              </div>
            ) : null}

            {submission.status === "rejected" ? (
              <div className="validation-box validation-box--error" role="alert">
                {submission.reason === "submission_queue_unavailable"
                  ? "기기의 제출 대기 저장소를 사용할 수 없습니다. 제출을 보관했다고 볼 수 없으므로 이 화면을 유지하고 다시 시도해주세요."
                  : submission.reason === "submission_blocked_requires_manual_retry"
                    ? "이 세션은 서버에서 제출이 거절되어 자동 재시도가 중단됐습니다. 제출 기록은 보존됩니다. 담당자 확인 후 수동 재시도해주세요."
                    : `서버가 제출을 승인하지 않았거나 대기 저장에 실패했습니다: ${submission.reason}`}
                <button type="button" className="secondary-button compact-button"
                  disabled={!online || submission.reason === "submission_blocked_requires_manual_retry"}
                  onClick={() => void submitFinishedGame()}>
                  {submission.reason === "submission_blocked_requires_manual_retry"
                    ? "수동 재시도 필요" : "서버 제출 다시 시도"}
                </button>
              </div>
            ) : null}

            {replayStarting ? (
              <div className="notice" role="status">
                선택한 결정 지점부터 새 서버 리플레이 세션을 준비하고 있습니다.
              </div>
            ) : null}

            {replayError ? (
              <div className="validation-box validation-box--error" role="alert">
                리플레이를 시작하지 못했습니다: {replayError === "competitive_session_cache_superseded"
                  ? "다른 탭에 최신 플레이가 저장되어 있습니다. 새로고침 후 다시 확인하세요."
                  : replayError}
              </div>
            ) : null}

            <HpReview
              scenario={scenario}
              game={game}
              evaluation={confirmedEvaluation}
              mode="competitive"
              replayEnabled={
                !scenario.incidentDebrief &&
                submission.status === "submitted" &&
                online &&
                !replayStarting
              }
              restartEnabled={false}
              onReplay={(nodeId) => {
                void startReplay(nodeId);
              }}
              {...(scenario.incidentDebrief
                ? {
                    onContinue: () => setReviewStage("incident"),
                    continueLabel: "실사건 학습 보기",
                  }
                : {})}
            />
          </>
        ) : null}

        {reviewStage === "incident" && scenario.incidentDebrief ? (
          <>
            {replayStarting ? (
              <div className="notice" role="status">
                선택한 결정 지점부터 새 서버 리플레이 세션을 준비하고 있습니다.
              </div>
            ) : null}

            {replayError ? (
              <div className="validation-box validation-box--error" role="alert">
                리플레이를 시작하지 못했습니다: {replayError === "competitive_session_cache_superseded"
                  ? "다른 탭에 최신 플레이가 저장되어 있습니다. 새로고침 후 다시 확인하세요."
                  : replayError}
              </div>
            ) : null}

            <IncidentDebrief
              scenario={scenario}
              game={game}
              replayEnabled={
                submission.status === "submitted" &&
                online &&
                !replayStarting
              }
              onReplay={(nodeId) => {
                void startReplay(nodeId);
              }}
            />
          </>
        ) : null}
      </section>
    );
  }

  return (
    <section className="game-page" aria-live="polite">
      <div className="game-status">
        <span>
          {server.seasonKey} · {server.perspectiveRole}
          {server.replayOf ? " · 리플레이" : ""}
        </span>
        <GameClock
          clockMin={view.clockMin}
          deadlineMin={view.deadlineMin}
        />
      </div>

      {!online ? (
        <div className="offline-banner" role="status">
          오프라인 · 진행 상태를 이 기기에 저장하고 있습니다.
        </div>
      ) : null}

      <PlayNodeStage view={view} onAction={dispatch} />
    </section>
  );
}
