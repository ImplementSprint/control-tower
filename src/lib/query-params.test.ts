import { describe, expect, it } from "vitest";
import { getSingleParam } from "./query-params";

describe("getSingleParam", () => {
  it("returns undefined when input is undefined", () => {
    expect(getSingleParam(undefined)).toBeUndefined();
  });

  it("returns scalar strings unchanged", () => {
    expect(getSingleParam("runs")).toBe("runs");
  });

  it("returns the first value from arrays", () => {
    expect(getSingleParam(["first", "second"])).toBe("first");
  });
});
