import { NextResponse } from "next/server";

export function jsonError(
  message: string,
  status = 500,
  extra: Record<string, unknown> = {},
) {
  return NextResponse.json(
    {
      error: message,
      ...extra,
    },
    { status },
  );
}
