import type { Effects } from "@hero/schema";

export interface BarrierCardDefinition {
  id: string;
  label: string;
  timeCostMin: number;
  effects: Effects;
}

export const BARRIER_CARDS: Record<string, BarrierCardDefinition> = {
  prejob_briefing: {
    id: "prejob_briefing",
    label: "Pre-job Briefing",
    timeCostMin: 5,
    effects: {
      barrierDelta: { briefing: 0.45 },
      metricsDelta: { awareness: 8, communication: 6, safety: 4 },
      psfMultipliers: { uncertainty: 0.85 },
    },
  },
  peer_check: {
    id: "peer_check",
    label: "Peer Check",
    timeCostMin: 3,
    effects: {
      barrierDelta: { peer_check: 0.5 },
      metricsDelta: { communication: 8, safety: 6 },
    },
  },
  self_check_star: {
    id: "self_check_star",
    label: "Self Check (STAR)",
    timeCostMin: 1,
    effects: {
      barrierDelta: { self_check: 0.35 },
      metricsDelta: { awareness: 7, procedure: 4 },
    },
  },
  three_way_communication: {
    id: "three_way_communication",
    label: "Three-way Communication",
    timeCostMin: 2,
    effects: {
      barrierDelta: { communication: 0.45 },
      metricsDelta: { communication: 10, awareness: 3 },
    },
  },
  stop_when_unsure: {
    id: "stop_when_unsure",
    label: "Stop When Unsure",
    timeCostMin: 5,
    effects: {
      barrierDelta: { stop: 0.65 },
      metricsDelta: { challenge: 12, safety: 10 },
      psfMultipliers: { time_pressure: 0.85, uncertainty: 0.75 },
    },
  },
  place_keeping: {
    id: "place_keeping",
    label: "Place Keeping",
    timeCostMin: 2,
    effects: {
      barrierDelta: { place_keeping: 0.4 },
      metricsDelta: { procedure: 9, awareness: 3 },
    },
  },
  independent_verification: {
    id: "independent_verification",
    label: "Independent Verification",
    timeCostMin: 5,
    effects: {
      barrierDelta: { independent_verification: 0.6 },
      metricsDelta: { safety: 9, communication: 4, procedure: 4 },
    },
  },
  questioning_attitude: {
    id: "questioning_attitude",
    label: "Questioning Attitude",
    timeCostMin: 2,
    effects: {
      barrierDelta: { questioning: 0.4 },
      metricsDelta: { challenge: 10, awareness: 6 },
      psfMultipliers: { uncertainty: 0.9 },
    },
  },
};
