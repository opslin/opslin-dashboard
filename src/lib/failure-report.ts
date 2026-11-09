/**
 * Doc 75 milestone M6. The failure report the API stores when a deploy fails (opslin-api `lib/dil/failure-report.ts`), as the
 * dashboard reads it. The API response is untrusted input: every field is checked, trimmed and typed here, and anything that is
 * not what the dialog expects is dropped, so a bad report can never break the page or render markup.
 */

export type ReportOutcome = "needs_configuration" | "application_defect" | "opslin_defect" | "infrastructure" | "unknown";

export interface ReportMissing {
  kind: "setting" | "file";
  name: string;
  why: string;
  foundIn?: string;
  howToFix: string;
  generate?: "random_base64_32" | null;
}

export interface FailureReport {
  version: 1;
  stage: string;
  cause: string;
  outcome: ReportOutcome;
  title: string;
  summary: string;
  missing: ReportMissing[];
  appSaid: string | null;
  opslinDid: string[];
  nextSteps: string[];
  /** The app the missing settings belong to: they can be saved on it and it redeployed. */
  resume?: { serverId: string; appId: string };
  technical: string;
}

const OUTCOMES: ReportOutcome[] = ["needs_configuration", "application_defect", "opslin_defect", "infrastructure", "unknown"];
const text = (value: unknown, max: number): string => (typeof value === "string" ? value.slice(0, max) : "");
const list = (value: unknown, max: number, each: number): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0).slice(0, max).map((item) => item.slice(0, each)) : [];

function resumeOf(value: unknown): { resume?: { serverId: string; appId: string } } {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  const serverId = text(raw.serverId, 80);
  const appId = text(raw.appId, 80);
  return serverId && appId ? { resume: { serverId, appId } } : {};
}

/** A report from an API value (a job's `result.failureReport` or a run's `result.report`), or null when it is not a usable report. */
export function parseFailureReport(value: unknown): FailureReport | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.version !== 1) return null;
  const title = text(raw.title, 300);
  if (!title) return null;
  const missing: ReportMissing[] = [];
  const seen = new Set<string>();
  for (const entry of Array.isArray(raw.missing) ? raw.missing.slice(0, 20) : []) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const name = text(item.name, 120);
    if (!name || seen.has(name) || (item.kind !== "setting" && item.kind !== "file")) continue;
    seen.add(name);
    missing.push({
      kind: item.kind,
      name,
      why: text(item.why, 400),
      ...(text(item.foundIn, 200) ? { foundIn: text(item.foundIn, 200) } : {}),
      howToFix: text(item.howToFix, 400),
      generate: item.generate === "random_base64_32" ? "random_base64_32" : null,
    });
  }
  return {
    version: 1,
    stage: text(raw.stage, 40) || "unknown",
    cause: text(raw.cause, 60) || "unknown",
    outcome: OUTCOMES.includes(raw.outcome as ReportOutcome) ? (raw.outcome as ReportOutcome) : "unknown",
    title,
    summary: text(raw.summary, 600),
    missing,
    appSaid: text(raw.appSaid, 300) || null,
    opslinDid: list(raw.opslinDid, 6, 300),
    nextSteps: list(raw.nextSteps, 6, 300),
    ...resumeOf(raw.resume),
    technical: text(raw.technical, 2000),
  };
}

/** The report of a failed job, or null for any other job. */
export function reportFromJob(job: { status?: string; result?: unknown } | null | undefined): FailureReport | null {
  if (!job || job.status !== "FAILED" || !job.result || typeof job.result !== "object") return null;
  return parseFailureReport((job.result as { failureReport?: unknown }).failureReport);
}

export interface Need { name: string; why: string }

/** The settings of a report that only the owner can give, in the shape the deploy page's input form takes. */
export function settingNeeds(report: FailureReport): Need[] {
  return report.missing.filter((item) => item.kind === "setting").map((item) => ({ name: item.name, why: item.why || "The app needs it to start." }));
}

/** Two lists of needed settings as one: a name appears once, with the first reason given. */
export function mergeNeeds(base: Need[] | undefined, extra: Need[]): Need[] {
  const seen = new Set<string>();
  return [...(base ?? []), ...extra].filter((need) => !seen.has(need.name) && seen.add(need.name));
}
