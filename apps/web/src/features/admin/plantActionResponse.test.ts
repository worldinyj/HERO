import { describe, expect, it } from "vitest";
import { readPlantCreated, readPlantStatus } from "./plantActionResponse";

const id = "e1000000-0000-0000-0000-000000000001";

describe("atomic plant mutation responses", () => {
  it("accepts only the expected newly created plant", () => {
    const good = { created: true, plantId: id, code: "SAEUL", displayName: "새울", isActive: true };
    expect(readPlantCreated(good, "SAEUL", "새울")).not.toBeNull();
    expect(readPlantCreated({ ...good, code: "OTHER" }, "SAEUL", "새울")).toBeNull();
    expect(readPlantCreated({ ...good, plantId: "bad" }, "SAEUL", "새울")).toBeNull();
    expect(readPlantCreated({ ...good, isActive: false }, "SAEUL", "새울")).toBeNull();
  });

  it("requires the status acknowledgment to identify the requested plant and new value", () => {
    expect(readPlantStatus({ changed: true, plantId: id, isActive: false }, id, false)).not.toBeNull();
    expect(readPlantStatus({ changed: false, plantId: id, isActive: false }, id, false)).not.toBeNull();
    expect(readPlantStatus({ changed: true, plantId: "other", isActive: false }, id, false)).toBeNull();
    expect(readPlantStatus({ changed: true, plantId: id, isActive: true }, id, false)).toBeNull();
  });

  it.each([null, undefined, [], {}, { error: "internal_error" }, 2, "ok"])(
    "never treats malformed server payload %s as a confirmed write", (payload) => {
      expect(readPlantCreated(payload, "SAEUL", "새울")).toBeNull();
      expect(readPlantStatus(payload, id, true)).toBeNull();
    },
  );
});
