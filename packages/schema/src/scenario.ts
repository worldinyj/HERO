import * as z from "zod";

export const SCENARIO_SCHEMA_VERSION = "1.0.0" as const;

export const JobRoleSchema = z.enum([
  "sro",
  "ro",
  "field_operator",
  "supervisor",
  "worker",
]);

export const MetricKeySchema = z.enum([
  "safety",
  "awareness",
  "communication",
  "procedure",
  "challenge",
]);

export const EndingSchema = z.enum([
  "safe_complete",
  "safe_stop",
  "near_miss",
  "event",
]);

const MetricsDeltaSchema = z.strictObject({
  safety: z.number().min(-100).max(100).optional(),
  awareness: z.number().min(-100).max(100).optional(),
  communication: z.number().min(-100).max(100).optional(),
  procedure: z.number().min(-100).max(100).optional(),
  challenge: z.number().min(-100).max(100).optional(),
});

export const EffectsSchema = z.strictObject({
  psfMultipliers: z.record(z.string().min(1), z.number().min(0.1).max(10)).optional(),
  barrierDelta: z.record(z.string().min(1), z.number().min(-1).max(1)).optional(),
  metricsDelta: MetricsDeltaSchema.optional(),
  flags: z.record(z.string().min(1), z.boolean()).optional(),
});

export const ChoiceSchema = z.strictObject({
  actionId: z.string().min(1).max(80).regex(/^[a-z0-9_:-]+$/u),
  label: z.string().min(1).max(180),
  next: z.string().min(1).max(120),
  timeCostMin: z.number().int().min(0).max(120),
  effects: EffectsSchema.optional(),
});

export const InfoActionSchema = z.strictObject({
  actionId: z.string().min(1).max(80).regex(/^[a-z0-9_:-]+$/u),
  label: z.string().min(1).max(120),
  revealText: z.string().min(1).max(1000),
  timeCostMin: z.number().int().min(0).max(60),
  effects: EffectsSchema.optional(),
});

const SceneNodeSchema = z.strictObject({
  type: z.literal("scene"),
  speaker: z.string().max(80).optional(),
  text: z.string().min(1).max(1200),
  next: z.string().min(1).max(120),
  background: z.string().max(160).optional(),
  audioCue: z.string().max(120).optional(),
});

const DecisionNodeSchema = z.strictObject({
  type: z.literal("decision"),
  prompt: z.string().min(1).max(500),
  choices: z.array(ChoiceSchema).min(3).max(4),
  infoActions: z.array(InfoActionSchema).max(4).default([]),
  allowedCards: z.array(z.string().min(1).max(80)).max(8).optional(),
});

const EventNodeSchema = z.strictObject({
  type: z.literal("event"),
  text: z.string().min(1).max(800),
  next: z.string().min(1).max(120),
  tone: z.enum(["neutral", "attention", "positive"]).default("neutral"),
  audioCue: z.string().max(120).optional(),
});

const HazardNodeSchema = z.strictObject({
  type: z.literal("hazard"),
  threshold: z.number().min(0).max(100),
  jitter: z.number().min(0).max(20).default(0),
  passNext: z.string().min(1).max(120),
  breachNext: z.string().min(1).max(120),
  tag: z.string().min(1).max(80).optional(),
});

const EndingNodeSchema = z.strictObject({
  type: z.literal("ending"),
  ending: EndingSchema,
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(1000),
});

export const ScenarioNodeSchema = z.discriminatedUnion("type", [
  SceneNodeSchema,
  DecisionNodeSchema,
  EventNodeSchema,
  HazardNodeSchema,
  EndingNodeSchema,
]);

const InitialMetricsSchema = z.strictObject({
  safety: z.number().min(0).max(100).default(50),
  awareness: z.number().min(0).max(100).default(50),
  communication: z.number().min(0).max(100).default(50),
  procedure: z.number().min(0).max(100).default(50),
  challenge: z.number().min(0).max(100).default(50),
});

const InitialStateSchema = z.strictObject({
  clockMin: z.number().int().min(0).max(24 * 60),
  deadlineMin: z.number().int().min(0).max(24 * 60),
  baseHazard: z.number().min(0).max(100),
  psf: z.record(z.string().min(1), z.number().min(0.1).max(10)).default({}),
  barriers: z.record(z.string().min(1), z.number().min(0).max(1)).default({}),
  metrics: InitialMetricsSchema.default({
    safety: 50,
    awareness: 50,
    communication: 50,
    procedure: 50,
    challenge: 50,
  }),
});

const IncidentLessonSchema = z.strictObject({
  title: z.string().min(1).max(140),
  detail: z.string().min(1).max(600),
  toolId: z.string().min(1).max(80).regex(/^[a-z0-9_:-]+$/u).optional(),
});

export const IncidentDebriefSchema = z.strictObject({
  caseType: z.string().min(1).max(140),
  overview: z.string().min(1).max(1400),
  rootCauses: z.array(z.string().min(1).max(320)).min(1).max(6),
  contributingFactors: z.array(z.string().min(1).max(320)).min(1).max(8),
  lessons: z.array(IncidentLessonSchema).min(1).max(6),
});

export const ScenarioSchema = z.strictObject({
  schemaVersion: z.literal(SCENARIO_SCHEMA_VERSION),
  id: z.string().min(1).max(100).regex(/^[a-z0-9_-]+$/u),
  version: z.number().int().positive(),
  title: z.string().min(1).max(160),
  defaultPerspectiveRole: JobRoleSchema,
  audienceJobs: z.array(JobRoleSchema).min(1).max(5),
  estimatedMinutes: z.number().int().min(1).max(60),
  startNode: z.string().min(1).max(120),
  cards: z.array(z.string().min(1).max(80)).max(8).default([]),
  initialState: InitialStateSchema,
  incidentDebrief: IncidentDebriefSchema.optional(),
  nodes: z.record(z.string().min(1).max(120), ScenarioNodeSchema),
});

export type JobRole = z.infer<typeof JobRoleSchema>;
export type MetricKey = z.infer<typeof MetricKeySchema>;
export type Ending = z.infer<typeof EndingSchema>;
export type Effects = z.infer<typeof EffectsSchema>;
export type Choice = z.infer<typeof ChoiceSchema>;
export type InfoAction = z.infer<typeof InfoActionSchema>;
export type IncidentDebrief = z.infer<typeof IncidentDebriefSchema>;
export type ScenarioNode = z.infer<typeof ScenarioNodeSchema>;
export type Scenario = z.infer<typeof ScenarioSchema>;

export function scenarioJsonSchema(): z.core.JSONSchema.BaseSchema {
  return z.toJSONSchema(ScenarioSchema, { target: "draft-2020-12" });
}
