"use client";

import { useEffect } from "react";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error("[global-error-boundary]", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#fafafa" }}>
        <main
          style={{
            display: "flex",
            minHeight: "100vh",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem",
          }}
        >
          <div
            style={{
              maxWidth: 480,
              width: "100%",
              border: "1px solid #e5e7eb",
              borderRadius: 24,
              padding: "2rem",
              background: "#fff",
              textAlign: "center",
              boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                width: 48,
                height: 48,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 16,
                border: "1px solid #e5e7eb",
                marginBottom: "1rem",
                fontSize: 24,
              }}
            >
              ⚠️
            </div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "0.5rem" }}>
              Application Error
            </h1>
            <p style={{ color: "#6b7280", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
              A critical error occurred. Please try again.
              {error.digest && (
                <span style={{ display: "block", marginTop: "0.5rem", fontFamily: "monospace", fontSize: "0.75rem" }}>
                  ID: {error.digest}
                </span>
              )}
            </p>
            <button
              type="button"
              onClick={reset}
              style={{
                padding: "0.5rem 1.25rem",
                borderRadius: 9999,
                border: "1px solid #e5e7eb",
                background: "#fff",
                cursor: "pointer",
                fontSize: "0.875rem",
                fontWeight: 500,
              }}
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
