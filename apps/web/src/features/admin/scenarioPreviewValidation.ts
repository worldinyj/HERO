import { ScenarioSchema, validateScenarioGraph, type Scenario } from "@hero/schema";

export interface PreviewIssue { path: string; message: string }
export interface PreviewValidation {
  scenario: Scenario | null;
  issues: PreviewIssue[];
  warnings: PreviewIssue[];
}

export function validatePreviewScenario(value: unknown): PreviewValidation {
  const parsed = ScenarioSchema.safeParse(value);
  if (!parsed.success) {
    return { scenario: null, issues: parsed.error.issues.map(issue => ({
      path: issue.path.join("."), message: issue.message,
    })), warnings: [] };
  }
  const graph = validateScenarioGraph(parsed.data);
  const issues = graph.filter(issue => issue.severity === "error");
  return {
    scenario: issues.length ? null : parsed.data,
    issues,
    warnings: graph.filter(issue => issue.severity === "warning"),
  };
}

export function parsePreviewJson(text: string): PreviewValidation {
  try { return validatePreviewScenario(JSON.parse(text)); }
  catch { return { scenario: null, issues: [{ path: "", message: "JSON 구문을 확인해주세요." }], warnings: [] }; }
}

export function readSavedPreview(value: unknown, requestedVersionId: string, expectedVersion: number): PreviewValidation {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { scenario: null, issues: [{ path: "", message: "미리보기 응답을 확인하지 못했습니다." }], warnings: [] };
  }
  const response = value as Record<string, unknown>;
  if (response.scenarioVersionId !== requestedVersionId || response.preview !== true || response.error !== undefined) {
    return { scenario: null, issues: [{ path: "", message: "요청한 버전과 미리보기 응답이 다릅니다." }], warnings: [] };
  }
  const checked = validatePreviewScenario(response.scenario);
  if (checked.scenario && checked.scenario.version !== expectedVersion) {
    return { scenario: null, issues: [{ path: "version", message: "목록의 버전과 시나리오 내용의 버전이 다릅니다." }], warnings: [] };
  }
  return checked;
}
