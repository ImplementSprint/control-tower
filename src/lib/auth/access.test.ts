import { beforeEach, describe, expect, it, vi } from "vitest";

const serverMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));
const adminMocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));
vi.mock("@/lib/server", () => serverMocks);
vi.mock("@/lib/supabase/admin", () => adminMocks);

import {
  getAuthenticatedAccessScope,
  getScopedTribes,
  type AccessScope,
} from "./access";

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

beforeEach(() => {
  vi.clearAllMocks();
});

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

describe("getAuthenticatedAccessScope", () => {
  it("does not add authorization roles or tribes from user metadata", async () => {
    serverMocks.createClient.mockResolvedValue({
      auth: {
        getUser: async () => ({
          data: {
            user: {
              id: "user-1",
              email: "user@example.com",
              app_metadata: { role: "platform_admin" },
              user_metadata: {
                tribe: "platform",
                user_name: "octouser",
              },
              identities: [],
            },
          },
        }),
      },
    });

    adminMocks.createSupabaseAdminClient.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              limit: async () => ({ data: [], error: null }),
            }),
          }),
        }),
      }),
    });

    const scope = await getAuthenticatedAccessScope();

    expect(scope).toMatchObject({
      userId: "user-1",
      roles: [],
      tribes: [],
      isPlatformAdmin: false,
      githubUsername: "octouser",
    });
  });
});
