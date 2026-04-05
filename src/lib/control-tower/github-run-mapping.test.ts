import { describe, expect, it } from "vitest";
import {
  buildRunIdTag,
  calculateDurationSeconds,
  getBranchEnvironment,
  resolveActionFromStatus,
  resolveDeploymentStatus,
} from "./github-run-mapping";

describe("github run mapping", () => {
  it("maps branch to environment", () => {
    expect(getBranchEnvironment("main")).toBe("main");
    expect(getBranchEnvironment("uat")).toBe("uat");
    expect(getBranchEnvironment("feature/my-branch")).toBe("test");
  });

  it("maps in-progress states to running", () => {
    expect(resolveDeploymentStatus({ action: "in_progress" })).toBe("running");
    expect(resolveDeploymentStatus({ status: "in_progress" })).toBe("running");
  });

  it("maps queued-like states to queued", () => {
    expect(resolveDeploymentStatus({ status: "queued" })).toBe("queued");
    expect(resolveDeploymentStatus({ status: "requested" })).toBe("queued");
    expect(resolveDeploymentStatus({ status: "waiting" })).toBe("queued");
    expect(resolveDeploymentStatus({ status: "pending" })).toBe("queued");
  });

  it("maps completed status based on conclusion", () => {
    expect(
      resolveDeploymentStatus({ status: "completed", conclusion: "success" }),
    ).toBe("success");
    expect(
      resolveDeploymentStatus({ status: "completed", conclusion: "cancelled" }),
    ).toBe("cancelled");
    expect(
      resolveDeploymentStatus({ status: "completed", conclusion: "skipped" }),
    ).toBe("cancelled");
    expect(
      resolveDeploymentStatus({ status: "completed", conclusion: "failure" }),
    ).toBe("failed");
  });

  it("builds run id tag", () => {
    expect(buildRunIdTag(123, 4)).toBe("run_id:123:attempt:4");
  });

  it("calculates duration in seconds", () => {
    expect(
      calculateDurationSeconds("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:10.000Z"),
    ).toBe(10);
    expect(calculateDurationSeconds(null, "2026-01-01T00:00:10.000Z")).toBeNull();
    expect(calculateDurationSeconds("invalid", "2026-01-01T00:00:10.000Z")).toBeNull();
  });

  it("resolves action from run status", () => {
    expect(resolveActionFromStatus("completed")).toBe("completed");
    expect(resolveActionFromStatus("in_progress")).toBe("in_progress");
    expect(resolveActionFromStatus("queued")).toBe("requested");
  });
});
