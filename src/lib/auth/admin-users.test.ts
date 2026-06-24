import { describe, expect, it, vi } from "vitest";
import { listAllAuthUsers } from "./admin-users";

describe("listAllAuthUsers", () => {
  it("pages through Supabase auth users until the final partial page", async () => {
    const listUsers = vi
      .fn()
      .mockResolvedValueOnce({
        data: { users: [{ id: "user-1" }, { id: "user-2" }] },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { users: [{ id: "user-3" }] },
        error: null,
      });

    const users = await listAllAuthUsers(
      { auth: { admin: { listUsers } } } as never,
      2,
    );

    expect(users.map((user) => user.id)).toEqual(["user-1", "user-2", "user-3"]);
    expect(listUsers).toHaveBeenCalledWith({ page: 1, perPage: 2 });
    expect(listUsers).toHaveBeenCalledWith({ page: 2, perPage: 2 });
  });
});
