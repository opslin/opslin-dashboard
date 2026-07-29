/**
 * Scripted `phase_progress` event sequences for the `/deploy-demo` harness
 * (doc 04 §2 — "deploy-demo becomes the harness: feeds simulated
 * phase_progress frames through the real reducer, great for QA of all
 * states without a VPS").
 *
 * Every step ID and event shape here is the real wire contract
 * (`opslin-dashboard/src/lib/phase-progress-types.ts`, mirroring
 * `opslin-api/src/lib/phase-progress.ts`) — only the *timing* and the
 * specific deployment this demo pretends to be are fabricated, and that
 * fabrication never leaves this page (fed through `DeployLiveView`'s
 * `demoOverride` prop, which real deploy screens never pass).
 */

import type { DeploymentRecord, PreflightCheck } from "@/lib/api";
import type { PhaseProgressEvent, PhaseStep } from "@/lib/phase-progress-types";
import { STEP_META } from "@/components/deploy/live/deploy-timeline";

interface StepSpec {
  step: PhaseStep;
  offsetSeconds: number;
  data?: PhaseProgressEvent["data"];
}

export interface DemoScenario {
  id: string;
  label: string;
  description: string;
  appId: string;
  appName: string;
  appDomain: string | null;
  serverName: string;
  serverConnected: boolean;
  specs: StepSpec[];
  finalStatus: DeploymentRecord["status"];
  previousSha?: string | null;
  connectionStatus?: "connecting" | "connected" | "reconnecting" | "closed";
  /** Seconds before t0 to report as the last-seen event — only set for the stale-connection scenario. */
  staleLastEventOffsetSeconds?: number;
  logs?: string;
  preflightChecks?: PreflightCheck[];
}

const SHA = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0";
const PREVIOUS_SHA = "9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e";

const SAFE_DEPLOY_SPECS: StepSpec[] = [
  { step: "enqueued", offsetSeconds: 0 },
  { step: "agent_assigned", offsetSeconds: 2 },
  { step: "clone_started", offsetSeconds: 4 },
  { step: "clone_complete", offsetSeconds: 7 },
  { step: "buildpack_detected", offsetSeconds: 9 },
  { step: "image_building", offsetSeconds: 11 },
  { step: "image_built", offsetSeconds: 26 },
  { step: "ci_gate_passed", offsetSeconds: 27 },
  { step: "candidate_started", offsetSeconds: 29 },
  { step: "health_probing", offsetSeconds: 31 },
  { step: "health_passed", offsetSeconds: 34, data: { healthPassed: true } },
  {
    step: "vu_running",
    offsetSeconds: 36,
    data: { activeVUs: 2, totalVUs: 10, p95Ms: 120, errorRate: 0, elapsedSeconds: 0, vuStatus: "running" },
  },
  {
    step: "vu_running",
    offsetSeconds: 40,
    data: { activeVUs: 10, totalVUs: 10, p95Ms: 145, errorRate: 0.01, elapsedSeconds: 4, vuStatus: "running" },
  },
  {
    step: "vu_complete",
    offsetSeconds: 46,
    data: { vuStatus: "complete", durationSeconds: 10, p95Ms: 150, errorRate: 0.01 },
  },
  { step: "report_generated", offsetSeconds: 47 },
  { step: "route_promoted", offsetSeconds: 49 },
];

const DEMO_LOG = `[demo] cloning repository...
[demo] Cloned in 2.8s
[demo] detected buildpack: nodejs (v20)
[demo] building image...
Authorization: Bearer [REDACTED]
[demo] image built in 15.2s
[demo] running health check against candidate...
[demo] health check passed
[demo] running load test (10 VUs, 10s)
[demo] load test complete — p95 150ms, error rate 1%
[demo] promoting candidate to live route
[demo] deploy complete`;

/** Synthetic 20k-line log — doc 04 §8 scenario 14, R6 perf validation (real virtualization, not truncation: `EnhancedLogViewer` gets the full string). */
function buildLargeLog(lineCount: number): string {
  const lines: string[] = [];
  for (let i = 0; i < lineCount; i += 1) {
    lines.push(`[demo] worker ${i % 8} processed request ${i} in ${(i % 40) + 5}ms`);
  }
  return lines.join("\n");
}

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "success-safe-deploy",
    label: "Success — Safe Deploy (full VU gate)",
    description: "Every step of the 16-step protocol, load test completes cleanly, route promoted.",
    appId: "demo-app-1",
    appName: "storefront-api",
    appDomain: "storefront-api.apps.opslin.dev",
    serverName: "prod-1",
    serverConnected: true,
    specs: SAFE_DEPLOY_SPECS,
    finalStatus: "succeeded",
    previousSha: PREVIOUS_SHA,
    logs: DEMO_LOG,
  },
  {
    id: "success-no-vu-gate",
    label: "Success — normal deploy (no VU gate)",
    description: "Plan-gated steps (ci_gate_passed, vu_*, report_generated) never fire — timeline must skip them, not show them stuck pending.",
    appId: "demo-app-2",
    appName: "marketing-site",
    appDomain: "marketing-site.apps.opslin.dev",
    serverName: "prod-2",
    serverConnected: true,
    specs: [
      { step: "enqueued", offsetSeconds: 0 },
      { step: "agent_assigned", offsetSeconds: 2 },
      { step: "clone_started", offsetSeconds: 4 },
      { step: "clone_complete", offsetSeconds: 6 },
      { step: "buildpack_detected", offsetSeconds: 8 },
      { step: "image_building", offsetSeconds: 10 },
      { step: "image_built", offsetSeconds: 20 },
      { step: "candidate_started", offsetSeconds: 21 },
      { step: "health_probing", offsetSeconds: 23 },
      { step: "health_passed", offsetSeconds: 25, data: { healthPassed: true } },
      { step: "route_promoted", offsetSeconds: 26 },
    ],
    finalStatus: "succeeded",
    previousSha: PREVIOUS_SHA,
  },
  {
    id: "vu-aborted-still-succeeds",
    label: "VU aborted, deploy still succeeds",
    description: "vu_aborted renders amber and stays amber, but doesn't block route_promoted — warning ≠ failure (doc 04 §4).",
    appId: "demo-app-3",
    appName: "payments-worker",
    appDomain: "payments-worker.apps.opslin.dev",
    serverName: "prod-1",
    serverConnected: true,
    specs: [
      ...SAFE_DEPLOY_SPECS.slice(0, 12), // through the first vu_running
      {
        step: "vu_aborted",
        offsetSeconds: 41,
        data: { vuStatus: "aborted", abortReason: "error rate exceeded threshold (12% > 10%)" },
      },
      { step: "report_generated", offsetSeconds: 42 },
      { step: "route_promoted", offsetSeconds: 44 },
    ],
    finalStatus: "succeeded",
    previousSha: PREVIOUS_SHA,
  },
  {
    id: "build-failure",
    label: "Build failure",
    description: "Stalls mid-build, never emits image_built. Exercises Retry + Roll back actions.",
    appId: "demo-app-4",
    appName: "image-processor",
    appDomain: "image-processor.apps.opslin.dev",
    serverName: "prod-3",
    serverConnected: true,
    specs: [
      { step: "enqueued", offsetSeconds: 0 },
      { step: "agent_assigned", offsetSeconds: 2 },
      { step: "clone_started", offsetSeconds: 4 },
      { step: "clone_complete", offsetSeconds: 7 },
      { step: "buildpack_detected", offsetSeconds: 9 },
      { step: "image_building", offsetSeconds: 11 },
    ],
    finalStatus: "failed",
    previousSha: PREVIOUS_SHA,
    logs: `[demo] cloning repository...
[demo] Cloned in 3.1s
[demo] detected buildpack: python (v3.12)
[demo] building image...
[demo] ERROR: pip install failed — could not find a version that satisfies the requirement foo-bar==9.9.9
[demo] build failed after 29.4s`,
  },
  {
    id: "rolled-back",
    label: "Rolled back",
    description: "Terminal state after a rollback — confirmation text only, no action buttons.",
    appId: "demo-app-5",
    appName: "auth-service",
    appDomain: "auth-service.apps.opslin.dev",
    serverName: "prod-1",
    serverConnected: true,
    specs: SAFE_DEPLOY_SPECS,
    finalStatus: "rolled_back",
    previousSha: PREVIOUS_SHA,
  },
  {
    id: "reconnecting-stale",
    label: "Connection lost mid-deploy",
    description: "Socket stuck reconnecting and no event for 60s+ — triggers the stale banner + reconnection indicator.",
    appId: "demo-app-6",
    appName: "billing-api",
    appDomain: null,
    serverName: "prod-2",
    serverConnected: true,
    specs: SAFE_DEPLOY_SPECS.slice(0, 7), // stops after image_built
    finalStatus: "running",
    connectionStatus: "reconnecting",
    staleLastEventOffsetSeconds: -60,
  },
  {
    id: "with-preflight-checks",
    label: "Preflight checks (FIS)",
    description: "PASS/WARN preflight results rendered above the timeline before the deploy proceeds.",
    appId: "demo-app-7",
    appName: "search-indexer",
    appDomain: "search-indexer.apps.opslin.dev",
    serverName: "prod-3",
    serverConnected: true,
    specs: SAFE_DEPLOY_SPECS,
    finalStatus: "succeeded",
    previousSha: PREVIOUS_SHA,
    preflightChecks: [
      { id: "disk_space_check", result: "PASS", evidence: "18.2 GB free / 40 GB total", overridable: false },
      { id: "port_conflict_check", result: "WARN", evidence: "Port 5432 already bound by another container", overridable: true },
      { id: "env_var_check", result: "PASS", evidence: "All 6 required env vars present", overridable: false },
    ],
  },
  {
    id: "preflight-blocked",
    label: "Preflight BLOCK (deploy never starts)",
    description: "A BLOCK-result check — zero phase_progress events ever fire, doc 04 §8 scenario 6.",
    appId: "demo-app-8",
    appName: "legacy-worker",
    appDomain: "legacy-worker.apps.opslin.dev",
    serverName: "prod-1",
    serverConnected: true,
    specs: [],
    finalStatus: "failed",
    previousSha: PREVIOUS_SHA,
    preflightChecks: [
      { id: "disk_space_check", result: "BLOCK", evidence: "0.4 GB free / 40 GB total — below the 2 GB minimum", overridable: false },
      { id: "env_var_check", result: "PASS", evidence: "All 6 required env vars present", overridable: false },
    ],
  },
  {
    id: "health-check-failed",
    label: "Health check failed",
    description: "Candidate starts but health_passed never arrives — doc 04 §8 scenario 8.",
    appId: "demo-app-9",
    appName: "notification-service",
    appDomain: "notification-service.apps.opslin.dev",
    serverName: "prod-2",
    serverConnected: true,
    specs: [...SAFE_DEPLOY_SPECS.slice(0, 10)], // through health_probing, no health_passed
    finalStatus: "failed",
    previousSha: PREVIOUS_SHA,
    logs: `[demo] candidate started on port 41230
[demo] probing GET /health...
[demo] probe 1/5 failed: connection refused
[demo] probe 2/5 failed: connection refused
[demo] probe 3/5 failed: connection refused
[demo] probe 4/5 failed: connection refused
[demo] probe 5/5 failed: connection refused
[demo] health check failed after 5 attempts — deploy aborted`,
  },
  {
    id: "vu-aborted-then-failed",
    label: "VU aborted, deploy fails",
    description: "vu_aborted followed by a real failure — doc 04 §8 scenario 10. Warning and failure are independent signals (doc 04 §4); this scenario shows them coinciding.",
    appId: "demo-app-10",
    appName: "checkout-api",
    appDomain: "checkout-api.apps.opslin.dev",
    serverName: "prod-1",
    serverConnected: true,
    specs: [
      ...SAFE_DEPLOY_SPECS.slice(0, 12), // through the first vu_running
      {
        step: "vu_aborted",
        offsetSeconds: 41,
        data: { vuStatus: "aborted", abortReason: "error rate exceeded threshold (38% > 10%)" },
      },
    ],
    finalStatus: "failed",
    previousSha: PREVIOUS_SHA,
    logs: `[demo] running load test (10 VUs, 10s)
[demo] error rate climbing: 12%, 24%, 38%...
[demo] load test aborted — error rate exceeded threshold
[demo] deploy marked failed, candidate never promoted`,
  },
  {
    id: "reconnecting-not-stale",
    label: "Reconnecting (not yet stale)",
    description: "Socket dropped moments ago — shows the reconnection indicator, distinct from the 45s+ stale banner (doc 04 §8 scenario 4).",
    appId: "demo-app-11",
    appName: "media-transcoder",
    appDomain: "media-transcoder.apps.opslin.dev",
    serverName: "prod-3",
    serverConnected: true,
    specs: SAFE_DEPLOY_SPECS.slice(0, 7), // stops after image_built
    finalStatus: "running",
    connectionStatus: "reconnecting",
    // No staleLastEventOffsetSeconds override — falls back to the last played
    // event's own (freshly built, seconds-old) timestamp, which is well under
    // the 45s isStale threshold. Leaving the demo open past 45s will
    // naturally flip this to the stale banner too — that's correct, real
    // behavior, not a scenario bug.
  },
  {
    id: "large-log-perf",
    label: "20k-line log (perf)",
    description: "Real 20,000-line log through EnhancedLogViewer — doc 04 §8 scenario 14. Confirms the DOM stays virtualized (a few dozen rows), not 20,000 real rows.",
    appId: "demo-app-12",
    appName: "batch-processor",
    appDomain: "batch-processor.apps.opslin.dev",
    serverName: "prod-2",
    serverConnected: true,
    specs: SAFE_DEPLOY_SPECS,
    finalStatus: "succeeded",
    previousSha: PREVIOUS_SHA,
    logs: buildLargeLog(20000),
  },
];

export interface BuiltScenario {
  scenario: DemoScenario;
  events: PhaseProgressEvent[];
  deploymentId: string;
  runningDeployment: DeploymentRecord;
  finalDeployment: DeploymentRecord;
  lastEventAtOverride: string | undefined;
}

/** Resolve a scenario's relative offsets against a concrete t0 (real `Date.now()` at build time). */
export function buildScenario(scenario: DemoScenario, t0: number): BuiltScenario {
  const deploymentId = `${scenario.id}-${t0}`;
  const startedAt = new Date(t0).toISOString();

  const events: PhaseProgressEvent[] = scenario.specs.map((spec) => ({
    type: "phase_progress",
    deploymentId,
    appId: scenario.appId,
    phase: STEP_META[spec.step].phase,
    step: spec.step,
    timestamp: new Date(t0 + spec.offsetSeconds * 1000).toISOString(),
    data: spec.data,
  }));

  const lastOffset = scenario.specs.at(-1)?.offsetSeconds ?? 0;
  const finishedAt = new Date(t0 + lastOffset * 1000 + 1000).toISOString();

  const base: Omit<DeploymentRecord, "status" | "finishedAt"> = {
    id: deploymentId,
    appId: scenario.appId,
    sha: SHA,
    attemptNumber: 1,
    startedAt,
    triggeredBy: "manual",
    triggerMeta: {},
    previousSha: scenario.previousSha ?? null,
  };

  const runningDeployment: DeploymentRecord = { ...base, status: "running" };
  const finalDeployment: DeploymentRecord = {
    ...base,
    status: scenario.finalStatus,
    finishedAt: scenario.finalStatus === "running" ? undefined : finishedAt,
  };

  const lastEventAtOverride =
    scenario.staleLastEventOffsetSeconds !== undefined
      ? new Date(t0 + scenario.staleLastEventOffsetSeconds * 1000).toISOString()
      : undefined;

  return { scenario, events, deploymentId, runningDeployment, finalDeployment, lastEventAtOverride };
}
