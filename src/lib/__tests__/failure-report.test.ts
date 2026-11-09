import { describe, expect, it } from "vitest";
import { mergeNeeds, parseFailureReport, reportFromJob, settingNeeds } from "../failure-report";

const valid = {
  version: 1, stage: "verify", cause: "missing_settings", outcome: "needs_configuration",
  title: "This app needs one setting before it can start: WHATSAPP_AUTH_MASTER_KEY", summary: "The app itself reported it as missing.",
  missing: [
    { kind: "setting", name: "WHATSAPP_AUTH_MASTER_KEY", why: "It is not set.", foundIn: "src/server/env.ts", howToFix: "Add it under Environment.", generate: null },
    { kind: "file", name: "drizzle/meta/_journal.json", why: "Drizzle needs it.", howToFix: "Commit it." },
  ],
  appSaid: "Invalid environment configuration: WHATSAPP_AUTH_MASTER_KEY", opslinDid: ["Opslin tried 2 automatic fixes."], nextSteps: ["Add it.", "Deploy again."], technical: "log tail",
};

describe("parseFailureReport", () => {
  it("accepts a well-formed report", () => {
    const report = parseFailureReport(valid)!;
    expect(report.outcome).toBe("needs_configuration");
    expect(report.missing).toHaveLength(2);
    expect(report.missing[0]).toMatchObject({ kind: "setting", name: "WHATSAPP_AUTH_MASTER_KEY", foundIn: "src/server/env.ts" });
  });
  it("rejects anything that is not a version 1 report with a title", () => {
    for (const bad of [null, undefined, "x", 3, {}, { ...valid, version: 2 }, { ...valid, title: "" }, { ...valid, title: 5 }]) expect(parseFailureReport(bad)).toBeNull();
  });
  it("drops what does not fit instead of failing: odd outcome, duplicate or malformed items, non-string lines", () => {
    const report = parseFailureReport({ ...valid, outcome: "weird", missing: [valid.missing[0], valid.missing[0], { kind: "x", name: "A" }, null, 4], opslinDid: [1, "ok", ""], nextSteps: "no" })!;
    expect(report.outcome).toBe("unknown");
    expect(report.missing).toHaveLength(1);
    expect(report.opslinDid).toEqual(["ok"]);
    expect(report.nextSteps).toEqual([]);
  });
  it("caps lengths", () => {
    const report = parseFailureReport({ ...valid, title: "t".repeat(5000), technical: "x".repeat(9000) })!;
    expect(report.title.length).toBe(300);
    expect(report.technical.length).toBe(2000);
  });
});

describe("reportFromJob", () => {
  it("reads the report of a failed job only", () => {
    expect(reportFromJob({ status: "FAILED", result: { failureReport: valid } })?.title).toContain("WHATSAPP_AUTH_MASTER_KEY");
    expect(reportFromJob({ status: "COMPLETED", result: { failureReport: valid } })).toBeNull();
    expect(reportFromJob({ status: "FAILED", result: {} })).toBeNull();
    expect(reportFromJob({ status: "FAILED" })).toBeNull();
    expect(reportFromJob(null)).toBeNull();
  });
});

describe("settingNeeds and mergeNeeds", () => {
  it("only settings, never files, become inputs", () => {
    expect(settingNeeds(parseFailureReport(valid)!)).toEqual([{ name: "WHATSAPP_AUTH_MASTER_KEY", why: "It is not set." }]);
  });
  it("a name appears once, with the first reason", () => {
    expect(mergeNeeds([{ name: "A", why: "a" }], [{ name: "A", why: "other" }, { name: "B", why: "b" }])).toEqual([{ name: "A", why: "a" }, { name: "B", why: "b" }]);
    expect(mergeNeeds(undefined, [{ name: "B", why: "b" }])).toEqual([{ name: "B", why: "b" }]);
  });
});

describe("resume target (doc 75 M3)", () => {
  it("is kept when it names a server and an app, and dropped otherwise", () => {
    expect(parseFailureReport({ ...valid, resume: { serverId: "srv-1", appId: "app-1" } })?.resume).toEqual({ serverId: "srv-1", appId: "app-1" });
    for (const bad of [null, "x", {}, { serverId: "s" }, { appId: "a" }, { serverId: 1, appId: 2 }, { serverId: "", appId: "a" }]) {
      expect(parseFailureReport({ ...valid, resume: bad })?.resume).toBeUndefined();
    }
  });
});
