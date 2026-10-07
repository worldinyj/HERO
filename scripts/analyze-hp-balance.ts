import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { replayImprovementPoints, SCENARIO_HP_MAX } from "../packages/engine/src/score.ts";

interface Check {
  id: string;
  pass: boolean;
  detail: string;
}

function maxReplayBonus(): {
  points: number;
  previous: number;
  current: number;
} {
  let best = { points: -1, previous: 0, current: 0 };

  for (let previous = 0; previous <= 100; previous += 1) {
    for (let current = 0; current <= 100; current += 1) {
      const points = replayImprovementPoints(current, previous);
      if (points > best.points) {
        best = { points, previous, current };
      }
    }
  }

  return best;
}

const root = resolve(import.meta.dirname, "..");
const seasonSql = readFileSync(
  resolve(root, "supabase/migrations/202610070004_leaderboard_seasons.sql"),
  "utf8",
);
const submitSource = readFileSync(
  resolve(root, "supabase/functions/submit-session/index.ts"),
  "utf8",
);

const bonusMax = maxReplayBonus();
const samePerformanceBonus = replayImprovementPoints(100, 100);
const noHistoryBonus = replayImprovementPoints(100);
const lowBaselineAdvantage = replayImprovementPoints(100, 0);
const repeatAfterBestBonus = replayImprovementPoints(100, 100);

const checks: Check[] = [
  {
    id: "scenario_hp_cap",
    pass: SCENARIO_HP_MAX === 310,
    detail: `SCENARIO_HP_MAX=${SCENARIO_HP_MAX}`,
  },
  {
    id: "replay_bonus_cap",
    pass: bonusMax.points <= 30,
    detail:
      `max=${bonusMax.points} at previous=${bonusMax.previous}, current=${bonusMax.current}`,
  },
  {
    id: "no_history_no_replay_bonus",
    pass: noHistoryBonus === 0,
    detail: `bonus=${noHistoryBonus}`,
  },
  {
    id: "same_performance_no_farming_bonus",
    pass: samePerformanceBonus === 0 && repeatAfterBestBonus === 0,
    detail:
      `samePerformance=${samePerformanceBonus}, repeatAfterBest=${repeatAfterBestBonus}`,
  },
  {
    id: "leaderboard_best_per_scenario",
    pass:
      /max\(ps\.hp_point\)::integer\s+as\s+best_hp/iu.test(seasonSql) &&
      /group by\s+ps\.season_id,\s*ps\.user_id,\s*sv\.scenario_id/iu.test(
        seasonSql,
      ),
    detail: "season score uses MAX(hp_point) grouped by scenario",
  },
  {
    id: "replay_bonus_only_for_replay_session",
    pass:
      /session\.replay_of\s*&&\s*previousMetricAverages\.length\s*>\s*0/iu.test(
        submitSource,
      ),
    detail: "submit-session gates previousBestMetricAvg on session.replay_of",
  },
];

const scenarioFiles = readdirSync(resolve(root, "scenarios/data"))
  .filter((name) => name.endsWith(".json"))
  .sort();

const warnings = [
  {
    id: "bounded_learning_improvement_advantage",
    severity: "review",
    detail:
      `A deliberately low prior metric average can make a later genuine replay earn up to +${lowBaselineAdvantage} HP. This is bounded, applies only to replay sessions, and repeated equal-performance replays earn 0 additional improvement points.`,
  },
  {
    id: "competitive_content_coverage",
    severity: scenarioFiles.some((name) => !name.startsWith("S00"))
      ? "info"
      : "review",
    detail: scenarioFiles.some((name) => !name.startsWith("S00"))
      ? `Competitive scenario files detected: ${scenarioFiles.filter((name) => !name.startsWith("S00")).join(", ")}`
      : "Only S00 tutorial content is currently stored in scenarios/data; rerun this analysis when S01–S03 competitive JSON is added.",
  },
];

console.log("HERO HP BALANCE / FARMING REVIEW");
console.log("================================");

for (const check of checks) {
  console.log(
    `${check.pass ? "PASS" : "FAIL"} ${check.id}: ${check.detail}`,
  );
}

console.log("");
for (const warning of warnings) {
  console.log(
    `${warning.severity.toUpperCase()} ${warning.id}: ${warning.detail}`,
  );
}

const failed = checks.filter((check) => !check.pass);

if (failed.length > 0) {
  console.error(
    `\n${failed.length} hard balance invariant(s) failed.\n`,
  );
  process.exitCode = 1;
}
