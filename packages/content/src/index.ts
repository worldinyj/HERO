import { ScenarioSchema, type Scenario } from "@hero/schema";
import tutorialRaw from "../../../scenarios/data/S00_tutorial.json";

export const S00_TUTORIAL: Scenario = ScenarioSchema.parse(tutorialRaw);

export const SCENARIO_CATALOG = {
  s00_tutorial: S00_TUTORIAL,
} as const;

export type ScenarioId = keyof typeof SCENARIO_CATALOG;

export function getScenarioById(id: string): Scenario | null {
  return id in SCENARIO_CATALOG
    ? SCENARIO_CATALOG[id as ScenarioId]
    : null;
}
