"use client";

/**
 * DeployTimeline — the truthful-progress replacement for the old
 * SVG beam-and-particle visualization (`AnimatedBeamPanel`, retired in R3).
 *
 * Renders the real 16-step protocol (`opslin-api/src/lib/phase-progress.ts`)
 * grouped into its 3 real phases. Rendering rules (doc 04 §4), enforced here:
 *   - A step renders only once its event has actually arrived — plan-gated
 *     steps (`ci_gate_passed`, `vu_*`, `report_generated`) on a normal
 *     (non-Safe-Deploy) deployment never show as "pending forever" because
 *     they simply never get an entry and are skipped entirely.
 *   - Only the 3 phase headers are guaranteed skeleton; nothing inside is
 *     invented.
 *   - Elapsed time per arrived step = real diff between that step's own
 *     event timestamp and the deployment's real `startedAt` — never a
 *     synthetic percentage or duration for the whole deploy.
 *   - `warning` (vu_aborted) renders amber and distinct from `completed`;
 *     it does not imply overall failure — the deploy may still succeed or
 *     fail independently (doc 04 §4).
 */

import { AlertTriangle, CheckCircle2, Circle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Phase, PhaseStep, PhaseStepStates } from "@/lib/phase-progress-types";
import type { StepTimestamps } from "@/hooks/use-deploy-phase-progress";
import { useNowTick } from "@/hooks/use-now-tick";

interface StepMeta {
  phase: Phase;
  label: string;
}

// Canonical order + human labels, mirroring opslin-api/src/lib/phase-progress.ts
// PHASE_STEPS/STEP_TO_PHASE exactly — this is the one place the frontend
// names these steps for display; the step IDs themselves are the real wire
// values, never invented. Exported for reuse by use-deploy-announcer.ts.
export const STEP_META: Record<PhaseStep, StepMeta> = {
  enqueued: { phase: "source", label: "Queued" },
  agent_assigned: { phase: "source", label: "Agent assigned" },
  clone_started: { phase: "source", label: "Cloning source" },
  clone_complete: { phase: "source", label: "Source cloned" },
  buildpack_detected: { phase: "build", label: "Buildpack detected" },
  image_building: { phase: "build", label: "Building image" },
  image_built: { phase: "build", label: "Image built" },
  ci_gate_passed: { phase: "build", label: "CI gate passed" },
  candidate_started: { phase: "build", label: "Candidate started" },
  health_probing: { phase: "validation", label: "Health probing" },
  health_passed: { phase: "validation", label: "Health check passed" },
  vu_running: { phase: "validation", label: "Load test running" },
  vu_complete: { phase: "validation", label: "Load test complete" },
  vu_aborted: { phase: "validation", label: "Load test aborted" },
  report_generated: { phase: "validation", label: "Report generated" },
  route_promoted: { phase: "validation", label: "Route promoted" },
};

const STEP_ORDER = Object.keys(STEP_META) as PhaseStep[];

const PHASE_LABEL: Record<Phase, string> = {
  source: "Source",
  build: "Build",
  validation: "Validate",
};

const PHASE_ORDER: Phase[] = ["source", "build", "validation"];

function elapsedLabel(fromIso: string, toIso: string): string {
  const fromMs = new Date(fromIso).getTime();
  const toMs = new Date(toIso).getTime();
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) {
    return "";
  }
  const seconds = Math.round((toMs - fromMs) / 1000);
  if (seconds < 60) return `+${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remSeconds = seconds % 60;
  return `+${minutes}m ${remSeconds}s`;
}

function StepIcon({ state }: { state: "active" | "completed" | "warning" }) {
  if (state === "completed") {
    return <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />;
  }
  if (state === "warning") {
    return <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden="true" />;
  }
  return <Loader2 className="size-4 shrink-0 animate-spin text-info" aria-hidden="true" />;
}

export interface DeployTimelineProps {
  phaseStates: PhaseStepStates;
  stepTimestamps: StepTimestamps;
  /** Real deployment start time (`Deployment.startedAt`) — the t0 every elapsed label is diffed against. */
  deploymentStartedAt: string | null | undefined;
  className?: string;
}

export function DeployTimeline({
  phaseStates,
  stepTimestamps,
  deploymentStartedAt,
  className,
}: DeployTimelineProps) {
  const arrivedSteps = STEP_ORDER.filter((step) => Boolean(phaseStates[step]));
  const activeStep = [...arrivedSteps].reverse().find((step) => phaseStates[step] === "active");
  const now = useNowTick(Boolean(activeStep));

  if (arrivedSteps.length === 0) {
    return (
      <div className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}>
        <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
        Waiting for the deploy to start…
      </div>
    );
  }

  return (
    <div className={cn("space-y-5", className)} role="list" aria-label="Deployment timeline">
      {PHASE_ORDER.map((phase) => {
        const stepsInPhase = arrivedSteps.filter((step) => STEP_META[step].phase === phase);
        if (stepsInPhase.length === 0) {
          return null;
        }
        return (
          <div key={phase} role="listitem">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {PHASE_LABEL[phase]}
            </p>
            <ul className="mt-2 space-y-2">
              {stepsInPhase.map((step) => {
                const state = phaseStates[step] as "active" | "completed" | "warning";
                const ts = stepTimestamps[step];
                const isActive = step === activeStep;
                const elapsed = deploymentStartedAt && ts
                  ? isActive
                    ? elapsedLabel(deploymentStartedAt, new Date(now).toISOString())
                    : elapsedLabel(deploymentStartedAt, ts)
                  : "";
                return (
                  <li
                    key={step}
                    className={cn(
                      "flex items-center gap-2.5 text-sm",
                      state === "completed" && "text-foreground",
                      state === "active" && "font-medium text-foreground",
                      state === "warning" && "text-warning-text"
                    )}
                  >
                    <StepIcon state={state} />
                    <span className="min-w-0 truncate">{STEP_META[step].label}</span>
                    {elapsed ? (
                      <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">{elapsed}</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      {/* Steps that haven't arrived yet render as a single quiet placeholder,
          never as fake per-step "pending" rows — doc 04 §4 explicitly forbids
          showing plan-gated steps as eternally pending. */}
      {!arrivedSteps.includes("route_promoted") ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Circle className="size-3 shrink-0" aria-hidden="true" />
          More steps will appear here as they happen.
        </p>
      ) : null}
    </div>
  );
}
