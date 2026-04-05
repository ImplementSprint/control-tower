import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatDateTime,
  formatRelativeTime,
  formatRuntime,
} from "./formatters";

describe("formatRuntime", () => {
  it("returns dash for null-like values", () => {
    expect(formatRuntime(null)).toBe("-");
    expect(formatRuntime(undefined)).toBe("-");
    expect(formatRuntime(Number.NaN)).toBe("-");
  });

  it("formats seconds and minutes", () => {
    expect(formatRuntime(45)).toBe("45s");
    expect(formatRuntime(75)).toBe("1m 15s");
  });
});

describe("formatDateTime", () => {
  it("returns dash for empty or invalid values", () => {
    expect(formatDateTime(null)).toBe("-");
    expect(formatDateTime(undefined)).toBe("-");
    expect(formatDateTime("not-a-date")).toBe("-");
  });

  it("returns a localized value for valid timestamps", () => {
    expect(formatDateTime("2026-04-05T12:00:00.000Z")).not.toBe("-");
  });
});

describe("formatRelativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-05T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns just now for empty or invalid values", () => {
    expect(formatRelativeTime(null)).toBe("just now");
    expect(formatRelativeTime(undefined)).toBe("just now");
    expect(formatRelativeTime("invalid-date")).toBe("just now");
  });

  it("formats minute, hour, and day ranges", () => {
    expect(formatRelativeTime("2026-04-05T11:30:00.000Z")).toBe("30 min ago");
    expect(formatRelativeTime("2026-04-05T10:00:00.000Z")).toBe("2 hours ago");
    expect(formatRelativeTime("2026-04-04T12:00:00.000Z")).toBe("1 day ago");
  });
});
