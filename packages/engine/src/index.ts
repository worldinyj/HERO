export const HERO_PRODUCT_NAME = "HERO" as const;

export type JobRole =
  | "sro"
  | "ro"
  | "field_operator"
  | "supervisor"
  | "worker";

export type PerspectiveRole = JobRole;

export type Ending =
  | "safe_complete"
  | "safe_stop"
  | "near_miss"
  | "event";

export const SCORE_RULE_VERSION = "1.0.0" as const;
export const SCENARIO_HP_MAX = 310 as const;
