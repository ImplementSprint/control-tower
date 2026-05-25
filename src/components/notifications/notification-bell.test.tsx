import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationBell } from "./notification-bell";

describe("NotificationBell", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads unread count after mount", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          count: 3,
        }),
      ),
    );

    render(<NotificationBell />);

    await waitFor(() => {
      expect(screen.getByLabelText("Notifications (3 unread)")).toBeTruthy();
    });
  });
});
