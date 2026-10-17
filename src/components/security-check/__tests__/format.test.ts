import { describe, expect, it } from "vitest";
import { cleanMessage, failingFindings, gradeClass, progressLabel, reasonText, reviewFindings, severityClass, unknownChecks } from "../format";
import { finding, report } from "./fixtures";

describe("security check formatting", () => {
    it("explains why a check could not run in plain words, never the machine code", () => {
        for (const code of ["blocked", "permission_denied", "tool_missing", "timeout", "scope_denied", "unsupported", "stale_intelligence", "parse_error", "budget_exhausted", "worker_failed", "something_new", undefined]) {
            const text = reasonText(code);
            expect(text.length).toBeGreaterThan(5);
            expect(text).not.toMatch(/_/);
        }
        expect(reasonText("scope_denied")).toBe("outside the domain you verified");
        expect(reasonText("blocked")).toBe("blocked by the site");
    });
    it("colours severities and grades with status tokens", () => {
        expect(severityClass("critical")).toContain("destructive");
        expect(severityClass("medium")).toContain("warning");
        expect(severityClass("low")).toContain("info");
        expect(gradeClass("A")).toContain("success");
        expect(gradeClass("C")).toContain("warning");
        expect(gradeClass("F")).toContain("destructive");
        expect(gradeClass(null)).toContain("muted");
    });
    it("orders problems by severity and keeps review signals apart", () => {
        const r = report({
            checks: [
                { ruleId: "A", state: "fail", findings: [finding({ fingerprint: "b", severity: "low", title: "low" }), finding({ fingerprint: "a", severity: "high", title: "high" })] },
                { ruleId: "B", state: "warn", findings: [finding({ fingerprint: "c", state: "warn", severity: "info", title: "signal" })] },
                { ruleId: "C", state: "unknown", reason: "timeout" },
            ],
        });
        expect(failingFindings(r).map((f) => f.title)).toEqual(["high", "low"]);
        expect(reviewFindings(r).map((f) => f.title)).toEqual(["signal"]);
        expect(unknownChecks(r)).toEqual([expect.objectContaining({ ruleId: "C", title: "C" })]);
    });
    it("never reassures when most checks could not run", () => {
        expect(cleanMessage(report({}, { coverage: { weighted: 0.2, byArea: {} } }))).toMatch(/too little/);
        expect(cleanMessage(report({}, { graded: false, coverage: { weighted: 0.8, byArea: {} } }))).toMatch(/some checks could not run/);
        expect(cleanMessage(report({}, { graded: true, coverage: { weighted: 1, byArea: {} } }))).toBe("No problems were found in the checks that completed.");
        expect(cleanMessage(report({}, { coverage: { weighted: 0.2, byArea: {} } }))).not.toMatch(/^No problems were found in the checks that completed\./);
    });
    it("labels progress", () => {
        expect(progressLabel(null)).toBe("Starting");
        expect(progressLabel({ phase: "probes", done: 12, total: 34 })).toBe("Looking for exposed files (12 of 34)");
        expect(progressLabel({ phase: "tls", done: 1, total: 1 })).toBe("Checking the certificate");
        expect(progressLabel({ phase: "mystery", done: 1, total: 5 })).toBe("Working (1 of 5)");
    });
});
