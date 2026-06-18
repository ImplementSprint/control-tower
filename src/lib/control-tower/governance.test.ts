import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resolveMappedTribeForRepository,
  resolveTribeForRepository,
} from "./governance";

const ORIGINAL_MAP = process.env.TRIBE_REPO_MAP_JSON;

afterEach(() => {
  process.env.TRIBE_REPO_MAP_JSON = ORIGINAL_MAP;
  vi.clearAllMocks();
});

function makeSupabase(mappedTribe: string | null) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: mappedTribe ? { tribe: mappedTribe } : null,
    error: null,
  });
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn((table: string) => {
    if (table === "repo_tribe_map") {
      return {
        select: () => ({
          eq: () => ({
            in: () => ({
              limit: () => ({ maybeSingle }),
            }),
          }),
        }),
        upsert,
      };
    }

    return {};
  });

  return { supabase: { from }, upsert };
}

describe("repository tribe resolution", () => {
  it("does not derive or persist a mapping for strict mapped resolution", async () => {
    delete process.env.TRIBE_REPO_MAP_JSON;
    const { supabase, upsert } = makeSupabase(null);

    await expect(
      resolveMappedTribeForRepository(supabase as never, "org/campus-one-fe"),
    ).resolves.toBeNull();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("keeps heuristic fallback only on the legacy resolver", async () => {
    delete process.env.TRIBE_REPO_MAP_JSON;
    const { supabase, upsert } = makeSupabase(null);

    await expect(
      resolveTribeForRepository(supabase as never, "org/campus-one-fe"),
    ).resolves.toBe("campus-one");
    expect(upsert).toHaveBeenCalled();
  });
});
