import type { Choice, MetricKey, Scenario, ScenarioNode } from "./scenario.ts";

export interface ScenarioIssue {
  severity: "error" | "warning";
  path: string;
  code:
    | "missing_start_node"
    | "missing_reference"
    | "unreachable_node"
    | "no_ending_path"
    | "duplicate_action_id"
    | "duplicate_card_id"
    | "dominant_choice"
    | "missing_incident_debrief";
  message: string;
}

const METRICS: MetricKey[] = [
  "safety",
  "awareness",
  "communication",
  "procedure",
  "challenge",
];

function targets(node: ScenarioNode): string[] {
  switch (node.type) {
    case "scene":
    case "event":
      return [node.next];
    case "decision":
      return node.choices.map((choice) => choice.next);
    case "hazard":
      return [node.passNext, node.breachNext];
    case "ending":
      return [];
  }
}

function metricDelta(choice: Choice, metric: MetricKey): number {
  return choice.effects?.metricsDelta?.[metric] ?? 0;
}

function dominates(a: Choice, b: Choice): boolean {
  const metricNotWorse = METRICS.every(
    (metric) => metricDelta(a, metric) >= metricDelta(b, metric),
  );
  const metricBetter = METRICS.some(
    (metric) => metricDelta(a, metric) > metricDelta(b, metric),
  );
  const noMoreTime = a.timeCostMin <= b.timeCostMin;

  return metricNotWorse && metricBetter && noMoreTime;
}

export function validateScenarioGraph(scenario: Scenario): ScenarioIssue[] {
  const issues: ScenarioIssue[] = [];
  const nodeIds = new Set(Object.keys(scenario.nodes));

  if (!nodeIds.has(scenario.startNode)) {
    issues.push({
      severity: "error",
      path: "startNode",
      code: "missing_start_node",
      message: `시작 노드 '${scenario.startNode}'가 nodes에 없습니다.`,
    });
    return issues;
  }

  const actionIds = new Map<string, string>();

  for (const [nodeId, node] of Object.entries(scenario.nodes)) {
    for (const target of targets(node)) {
      if (!nodeIds.has(target)) {
        issues.push({
          severity: "error",
          path: `nodes.${nodeId}`,
          code: "missing_reference",
          message: `노드 '${nodeId}'가 존재하지 않는 '${target}'를 참조합니다.`,
        });
      }
    }

    if (node.type === "decision") {
      for (const action of [...node.choices, ...node.infoActions]) {
        const previous = actionIds.get(action.actionId);
        if (previous) {
          issues.push({
            severity: "error",
            path: `nodes.${nodeId}`,
            code: "duplicate_action_id",
            message: `actionId '${action.actionId}'가 '${previous}'와 중복됩니다.`,
          });
        } else {
          actionIds.set(action.actionId, nodeId);
        }
      }

      for (const candidate of node.choices) {
        const dominated = node.choices.filter(
          (other) => other.actionId !== candidate.actionId && dominates(candidate, other),
        );

        if (dominated.length === node.choices.length - 1 && dominated.length > 0) {
          issues.push({
            severity: "warning",
            path: `nodes.${nodeId}.choices`,
            code: "dominant_choice",
            message: `'${candidate.actionId}'가 시간·학습지표 기준으로 다른 선택지보다 일방적으로 우월합니다.`,
          });
        }
      }
    }
  }

  if (scenario.id !== "s00_tutorial" && !scenario.incidentDebrief) {
    issues.push({
      severity: "warning",
      path: "incidentDebrief",
      code: "missing_incident_debrief",
      message:
        "경쟁 시나리오는 배포 전 익명화된 실사건 공개(사건유형·근본원인·기여요인·HU Tool 교훈)를 작성해야 합니다.",
    });
  }

  if (new Set(scenario.cards).size !== scenario.cards.length) {
    issues.push({
      severity: "error",
      path: "cards",
      code: "duplicate_card_id",
      message: "시나리오 카드 ID가 중복됩니다.",
    });
  }

  const reachable = new Set<string>();
  const stack = [scenario.startNode];

  while (stack.length > 0) {
    const nodeId = stack.pop();
    if (!nodeId || reachable.has(nodeId)) continue;

    const node = scenario.nodes[nodeId];
    if (!node) continue;

    reachable.add(nodeId);
    stack.push(...targets(node));
  }

  for (const nodeId of nodeIds) {
    if (!reachable.has(nodeId)) {
      issues.push({
        severity: "warning",
        path: `nodes.${nodeId}`,
        code: "unreachable_node",
        message: `노드 '${nodeId}'는 시작 노드에서 도달할 수 없습니다.`,
      });
    }
  }

  const canReachEnding = new Set<string>(
    Object.entries(scenario.nodes)
      .filter(([, node]) => node.type === "ending")
      .map(([nodeId]) => nodeId),
  );

  let changed = true;
  while (changed) {
    changed = false;
    for (const [nodeId, node] of Object.entries(scenario.nodes)) {
      if (canReachEnding.has(nodeId)) continue;
      if (targets(node).some((target) => canReachEnding.has(target))) {
        canReachEnding.add(nodeId);
        changed = true;
      }
    }
  }

  for (const nodeId of reachable) {
    if (!canReachEnding.has(nodeId)) {
      issues.push({
        severity: "error",
        path: `nodes.${nodeId}`,
        code: "no_ending_path",
        message: `도달 가능한 노드 '${nodeId}'에서 엔딩으로 이어지는 경로가 없습니다.`,
      });
    }
  }

  return issues;
}
