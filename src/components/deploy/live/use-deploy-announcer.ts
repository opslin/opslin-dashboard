"use client";

/**
 * useDeployAnnouncement — aria-live text for the unified deploy view.
 *
 * Replaces the old `cinematic/accessibility-announcer.tsx`, which was tied
 * to the retiring gsap `ResolvedStage`/`PanelState` taxonomy. Same concept
 * (announce step transitions + terminal outcomes for screen readers), driven
 * by the real `phaseStates` map and the real 6-value `Deployment.status`
 * instead of the old stage FSM.
 *
 * Computes the announcement during render (React's documented "adjusting
 * state when a prop changes" pattern — https://react.dev/learn/you-might-not-need-an-effect)
 * rather than in a `useEffect`, so a genuine transition is announced on the
 * same render it's detected rather than one tick later. This project's
 * stricter React Compiler lint rules forbid tracking the "previous value"
 * via a ref read/write during render (`react-hooks/refs`), so the tracking
 * value is state too — which means callers MUST pass a referentially-stable
 * `phaseStates` (true of `useDeployPhaseProgress`'s real return value; a
 * fresh object literal on every call would infinite-loop here by design).
 */

import { useState } from "react";
import type { PhaseStep, PhaseStepStates } from "@/lib/phase-progress-types";
import { STEP_META } from "./deploy-timeline";

export type OuterDeploymentStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "aborted"
  | "rolled_back"
  | null
  | undefined;

function transitionAnnouncement(prev: PhaseStepStates, next: PhaseStepStates): string | null {
  const parts: string[] = [];
  for (const key of Object.keys(next)) {
    const step = key as PhaseStep;
    const prevState = prev[step];
    const nextState = next[step];
    const label = STEP_META[step]?.label ?? step;
    if (nextState === "completed" && prevState !== "completed") {
      parts.push(`${label}: complete.`);
    } else if (nextState === "warning" && prevState !== "warning") {
      parts.push(`${label}: warning.`);
    } else if (nextState === "active" && prevState !== "active" && prevState !== "completed") {
      parts.push(`${label} starting.`);
    }
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

function terminalAnnouncement(status: OuterDeploymentStatus, appDomain?: string | null): string | null {
  if (status === "succeeded") {
    return `Deployment complete. Your app is live${appDomain ? ` at ${appDomain}` : ""}.`;
  }
  if (status === "failed") {
    return "Deployment failed.";
  }
  if (status === "aborted") {
    return "Deployment aborted.";
  }
  if (status === "rolled_back") {
    return "Rollback complete.";
  }
  return null;
}

export function useDeployAnnouncement(
  phaseStates: PhaseStepStates,
  deploymentStatus: OuterDeploymentStatus,
  appDomain?: string | null
): string {
  const [announcement, setAnnouncement] = useState("");
  const [prevPhaseStates, setPrevPhaseStates] = useState(phaseStates);
  const [prevStatus, setPrevStatus] = useState(deploymentStatus);

  if (phaseStates !== prevPhaseStates) {
    const next = transitionAnnouncement(prevPhaseStates, phaseStates);
    setPrevPhaseStates(phaseStates);
    if (next) {
      setAnnouncement(next);
    }
  }

  if (deploymentStatus !== prevStatus) {
    const next = terminalAnnouncement(deploymentStatus, appDomain);
    setPrevStatus(deploymentStatus);
    if (next) {
      setAnnouncement(next);
    }
  }

  return announcement;
}
