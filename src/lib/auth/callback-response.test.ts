import { describe, expect, it } from "vitest";
import { resolveSafeNextPath } from "./callback-response";

describe("resolveSafeNextPath", () => {
  it("allows in-app paths", () => {
    expect(resolveSafeNextPath("/runs")).toBe("/runs");
  });

  it("falls back for missing or unsafe next paths", () => {
    expect(resolveSafeNextPath(null)).toBe("/");
    expect(resolveSafeNextPath("https://example.com")).toBe("/");
    expect(resolveSafeNextPath("//evil.com")).toBe("/");
    expect(resolveSafeNextPath("/auth/login")).toBe("/");
    expect(resolveSafeNextPath("/auth/callback")).toBe("/");
  });
});
