import { describe, expect, it } from "vitest";
import { getScopedTribes, type AccessScope } from "./access";

const baseScope: AccessScope = {
  userId: "user-1",
  email: "user@example.com",
  tribes: ["alpha", "beta"],
  roles: ["viewer"],
  isPlatformAdmin: false,
  githubUsername: null,
  githubDisplayName: null,
  githubAvatarUrl: null,
  githubProfileUrl: null,
};

describe("getScopedTribes", () => {
  it("returns all scoped tribes for non-admin when no filter", () => {
    expect(getScopedTribes(baseScope)).toEqual(["alpha", "beta"]);
  });

  it("returns requested tribe when non-admin has access", () => {
    expect(getScopedTribes(baseScope, "beta")).toEqual(["beta"]);
  });

  it("returns empty array when non-admin requests unauthorized tribe", () => {
    expect(getScopedTribes(baseScope, "gamma")).toEqual([]);
  });

  it("returns null for admin when no filter", () => {
    const adminScope: AccessScope = {
      ...baseScope,
      isPlatformAdmin: true,
      roles: ["platform_admin"],
    };

    expect(getScopedTribes(adminScope)).toBeNull();
  });

  it("returns normalized filtered tribe for admin", () => {
    const adminScope: AccessScope = {
      ...baseScope,
      isPlatformAdmin: true,
      roles: ["platform_admin"],
    };

    expect(getScopedTribes(adminScope, "  ALPHA  ")).toEqual(["alpha"]);
  });
});
