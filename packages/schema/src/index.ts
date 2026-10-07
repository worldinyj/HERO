export const SCENARIO_SCHEMA_VERSION = "1.0.0" as const;

export interface ScenarioSummary {
  id: string;
  version: number;
  title: string;
  defaultPerspectiveRole: string;
}
