import { describe, expect, it } from "vitest";
import { hasMaskedSecret } from "@/lib/logs";

/**
 * `hasMaskedSecret` is a display-only trust-cue detector (doc 04 §6/§7) — it
 * never redacts anything itself, it only recognizes the literal markers the
 * API's server-side masking (opslin-api/src/lib/admin-secret-mask.ts,
 * applied to deploy logs in lib/deployment-live.ts) leaves behind. These
 * cases mirror that module's actual `maskSensitiveString` replacement
 * strings exactly, so the indicator only lights up on real masked output.
 */
describe("hasMaskedSecret", () => {
    it("detects a generic [REDACTED] marker", () => {
        expect(hasMaskedSecret("DATABASE_URL=[REDACTED]")).toBe(true);
    });

    it("detects the JWT-specific [REDACTED_JWT] marker", () => {
        expect(hasMaskedSecret("token=[REDACTED_JWT]")).toBe(true);
    });

    it("detects a masked bearer token", () => {
        expect(hasMaskedSecret("Authorization: Bearer [REDACTED]")).toBe(true);
    });

    it("does not flag ordinary log lines", () => {
        expect(hasMaskedSecret("Building image for app my-app...")).toBe(false);
        expect(hasMaskedSecret("Health check passed after 3 attempts")).toBe(false);
    });

    it("does not false-positive on the word 'redacted' outside the exact marker shape", () => {
        // Only the exact bracketed marker counts — a plain-English mention
        // of the word must not light up the indicator (it's a trust cue,
        // not a keyword search).
        expect(hasMaskedSecret("this value was redacted earlier")).toBe(false);
    });
});
