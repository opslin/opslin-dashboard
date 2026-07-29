"use client";

/**
 * DeployLiveView — the single, unified deployment experience (doc 04 §2,
 * "USER DECISION: unify"). Replaces the two previous, competing UIs:
 *   - `AnimatedBeamPanel`/`LiveAnimatedBeamPanel` (SVG beam+particles)
 *   - `CinematicDeployOverlay` (gsap full-screen stage orchestration)
 *
 * Two presentations of one implementation (doc 04 §2):
 *   - `mode="inline"` — embedded in the app's Deployments tab / feed, next
 *     to the existing `DeploymentCommandCenter` (which already owns the
 *     header/status-badge/diagnostics — this component does not duplicate
 *     that, it renders the timeline + log area + the context fields
 *     DeploymentCommandCenter doesn't already show).
 *   - `mode="overlay"` — full-screen glass presentation at the
 *     deploy/rollback trigger moment (doc 04 §2's "sanctioned cinematic
 *     surface", 400-700ms motion tier), auto-offering a success celebration.
 *
 * Single real event source: `useDeployPhaseProgress` (step timeline) +
 * `useQuery(getDeploymentDetail)` (outer 6-state truth + real fields).
 * Zero synthetic progress anywhere (doc 04 §1.4): no cancel button (no
 * endpoint exists), no whole-deploy percent/ETA.
 */

import { lazy, Suspense, useEffect, useId, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ExternalLink, RotateCcw, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import { api, type DeploymentRecord, type PreflightCheck } from "@/lib/api";
import type { PhaseProgressData, PhaseProgressEvent, PhaseStepStates } from "@/lib/phase-progress-types";
import {
  mergeVuData,
  reducePhaseStates,
  reduceStepTimestamps,
  useDeployPhaseProgress,
  type StepTimestamps,
} from "@/hooks/use-deploy-phase-progress";
import { DeployTimeline } from "./deploy-timeline";
import { useNowTick } from "@/hooks/use-now-tick";
import { DeployContextRail } from "./deploy-context-rail";
import { useDeployAnnouncement } from "./use-deploy-announcer";
import { CelebrationOverlay } from "@/components/deploy/cinematic/celebration-overlay";
import { ReconnectionIndicator } from "@/components/deploy/cinematic/reconnection-indicator";
import { useReducedMotion } from "@/components/deploy/cinematic/use-reduced-motion";
import { useVisibilityPause } from "@/components/deploy/cinematic/use-visibility-pause";
import { PreflightChecksPanel } from "@/components/apps/preflight-checks-panel";

const LazyEnhancedLogViewer = lazy(() =>
  import("@/components/logs/enhanced-log-viewer").then((module) => ({
    default: module.EnhancedLogViewer,
  }))
);

/**
 * Demo/QA-only escape hatch (doc 04 §2 — "deploy-demo becomes the harness:
 * feeds simulated phase_progress frames through the real reducer"). When
 * set, this component opens no WebSocket and makes no `getDeploymentDetail`
 * request — every derived value is folded from `events` through the exact
 * same exported reducers (`reducePhaseStates`/`reduceStepTimestamps`/
 * `mergeVuData`) the live hook uses internally, so the rendered UI is
 * driven by the real state machine, only fed scripted input. Never set
 * outside `/deploy-demo`.
 */
export interface DeployLiveDemoOverride {
  events: PhaseProgressEvent[];
  deployment: DeploymentRecord;
  connectionStatus?: "idle" | "connecting" | "connected" | "reconnecting" | "closed";
  lastEventAt?: string | null;
}

export interface DeployLiveViewProps {
  mode: "inline" | "overlay";
  appId: string;
  deploymentId: string | null | undefined;
  appName: string;
  appDomain?: string | null;
  serverName?: string | null;
  serverConnected?: boolean;
  /** Accumulated deploy log text — real blob from `App.deployLogs` / `useDeploymentLive`. Parent-supplied since both mount points already track this. */
  logs?: string | null;
  preflightChecks?: PreflightCheck[];
  orgRole?: string | null;
  enabled?: boolean;
  /** Overlay mode only — dismiss the full-screen presentation. */
  onDismiss?: () => void;
  onRetry?: () => void;
  onRollback?: () => void;
  rollbackAvailable?: boolean;
  rollbackPending?: boolean;
  className?: string;
  demoOverride?: DeployLiveDemoOverride;
}

function DeployLiveViewInner(props: DeployLiveViewProps) {
  const {
    appId,
    deploymentId,
    appName,
    appDomain,
    serverName,
    serverConnected,
    logs,
    preflightChecks,
    orgRole,
    enabled = true,
    onRetry,
    onRollback,
    rollbackAvailable,
    rollbackPending,
    mode,
    className,
    demoOverride,
  } = props;

  const liveState = useDeployPhaseProgress(demoOverride ? null : deploymentId, {
    enabled: enabled && !demoOverride,
  });

  // Fold demo events through the exact reducers the live hook uses — see
  // `DeployLiveDemoOverride` doc comment above.
  const demoFold = useMemo(() => {
    if (!demoOverride) return null;
    let states: PhaseStepStates = {};
    let timestamps: StepTimestamps = {};
    let data: PhaseProgressData | undefined;
    for (const event of demoOverride.events) {
      states = reducePhaseStates(states, event);
      timestamps = reduceStepTimestamps(timestamps, event);
      data = mergeVuData(data, event);
    }
    return { states, timestamps, data };
  }, [demoOverride]);

  const phaseStates = demoFold ? demoFold.states : liveState.phaseStates;
  const phaseProgressData = demoFold ? demoFold.data : liveState.phaseProgressData;
  const stepTimestamps = demoFold ? demoFold.timestamps : liveState.stepTimestamps;
  const connectionStatus = demoOverride
    ? demoOverride.connectionStatus ?? "connected"
    : liveState.status;
  const lastEventAt = demoOverride
    ? demoOverride.lastEventAt ?? demoOverride.events.at(-1)?.timestamp ?? null
    : liveState.lastEventAt;

  const deploymentQuery = useQuery({
    queryKey: ["deployment-detail", appId, deploymentId],
    queryFn: () => api.getDeploymentDetail(appId, deploymentId as string),
    enabled: enabled && !demoOverride && Boolean(appId) && Boolean(deploymentId),
    refetchInterval: (query) => {
      const data = query.state.data;
      const terminal = data && ["succeeded", "failed", "aborted", "rolled_back"].includes(data.status);
      return terminal ? false : 5000;
    },
  });
  const deployment = demoOverride ? demoOverride.deployment : deploymentQuery.data;

  const reducedMotion = useReducedMotion();
  const visibilityPaused = useVisibilityPause();
  const announcement = useDeployAnnouncement(phaseStates, deployment?.status, appDomain);

  const isSucceeded = deployment?.status === "succeeded";
  const isFailed = deployment?.status === "failed" || deployment?.status === "aborted";
  const isRolledBack = deployment?.status === "rolled_back";
  const isReconnecting = connectionStatus === "reconnecting";
  // UNKNOWN display state (doc 04 §1.1) — never persisted, only derived: the
  // socket is down AND we haven't heard anything in a while. `now` is a
  // ticking state value (not a direct Date.now() read) so this stays pure
  // during render per this project's React Compiler rules.
  const staleCandidate = connectionStatus === "reconnecting" || connectionStatus === "closed";
  const now = useNowTick(staleCandidate);
  const isStale = useMemo(() => {
    if (!staleCandidate || !lastEventAt) return false;
    return now - new Date(lastEventAt).getTime() > 45_000;
  }, [staleCandidate, lastEventAt, now]);

  const headerStatus = deployment?.status ?? (enabled ? "pending" : "pending");

  const timeline = (
    <DeployTimeline
      phaseStates={phaseStates}
      stepTimestamps={stepTimestamps}
      deploymentStartedAt={deployment?.startedAt}
    />
  );

  const rail = (
    <DeployContextRail
      serverName={serverName}
      serverConnected={serverConnected}
      healthPassed={phaseProgressData?.healthPassed}
      previousSha={deployment?.previousSha}
    />
  );

  const logArea = logs ? (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading log viewer…</p>}>
      <LazyEnhancedLogViewer
        lines={logs}
        title="Deploy log"
        fileName={`opslin-${appName}-${deploymentId ?? "deploy"}.log`}
        height={mode === "overlay" ? 220 : 320}
      />
    </Suspense>
  ) : null;

  const preflight =
    preflightChecks && preflightChecks.length > 0 ? (
      <PreflightChecksPanel checks={preflightChecks} orgRole={orgRole} />
    ) : null;

  return (
    <div className={cn("space-y-4", className)}>
      {/* aria-live announcer — visually hidden, doc 04 §2/§9 */}
      <div aria-live="polite" role="status" className="sr-only">
        {announcement}
      </div>

      {isStale ? (
        <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning-muted px-3 py-2 text-sm text-warning-text">
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          Connection lost — last known state at {lastEventAt ? new Date(lastEventAt).toLocaleTimeString() : "unknown time"}.
        </div>
      ) : null}

      {preflight}

      <div className="flex items-center gap-2">
        <StatusBadge status={headerStatus} />
        {deployment?.sha ? (
          <span className="font-mono text-xs text-muted-foreground">{deployment.sha.slice(0, 7)}</span>
        ) : null}
        {deployment?.attemptNumber && deployment.attemptNumber > 1 ? (
          <span className="text-xs text-muted-foreground">Attempt {deployment.attemptNumber}</span>
        ) : null}
      </div>

      <div className={cn("grid gap-4", mode === "overlay" ? "md:grid-cols-[1fr_240px]" : "lg:grid-cols-[1fr_260px]")}>
        {timeline}
        {rail}
      </div>

      {logArea}

      {isFailed ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
          {onRetry ? (
            <Button size="sm" variant="outline" onClick={onRetry}>
              Retry
            </Button>
          ) : null}
          {rollbackAvailable && onRollback ? (
            <Button size="sm" variant="outline" onClick={onRollback} disabled={rollbackPending}>
              <RotateCcw className="size-3.5" />
              {rollbackPending ? "Rolling back…" : "Roll back"}
            </Button>
          ) : null}
        </div>
      ) : null}

      {isSucceeded && appDomain ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
          <Button size="sm" variant="outline" asChild>
            <a href={`https://${appDomain}`} target="_blank" rel="noreferrer">
              <ExternalLink className="size-3.5" />
              View app
            </a>
          </Button>
          {rollbackAvailable && onRollback ? (
            <Button size="sm" variant="outline" onClick={onRollback} disabled={rollbackPending}>
              <RotateCcw className="size-3.5" />
              Roll back
            </Button>
          ) : null}
        </div>
      ) : null}

      {isRolledBack ? (
        <p className="flex items-center gap-2 border-t border-border/70 pt-3 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
          Rolled back{deployment?.previousSha ? ` to ${deployment.previousSha.slice(0, 7)}` : ""}.
        </p>
      ) : null}

      {mode === "overlay" && !visibilityPaused && isSucceeded ? (
        <CelebrationOverlay
          appDomain={appDomain ?? appName}
          reducedMotion={reducedMotion}
          onComplete={() => {}}
        />
      ) : null}

      <ReconnectionIndicator isReconnecting={isReconnecting && !isStale} reducedMotion={reducedMotion} />
    </div>
  );
}

/**
 * Overlay mode has no Radix Dialog under it (a custom framer-motion/glass
 * presentation, not the shared `DialogContent`), so it doesn't get Radix's
 * focus trap/Escape/initial-focus for free — this hook adds the same
 * behavior by hand (R6 a11y pass): Escape dismisses, Tab wraps within the
 * panel instead of escaping to the page behind it, and focus moves into the
 * panel once per open (not on every re-render, so it never steals focus back
 * from something the user is actively interacting with inside it).
 */
function useOverlayA11y(enabled: boolean, onDismiss?: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  const wasEnabledRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      wasEnabledRef.current = false;
      return;
    }
    if (!wasEnabledRef.current) {
      wasEnabledRef.current = true;
      panelRef.current?.focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onDismiss?.();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [enabled, onDismiss]);

  return panelRef;
}

export function DeployLiveView(props: DeployLiveViewProps) {
  const titleId = useId();
  const isOverlayOpen = props.mode === "overlay" && props.enabled !== false;
  const panelRef = useOverlayA11y(isOverlayOpen, props.onDismiss);

  if (props.mode === "inline") {
    return <DeployLiveViewInner {...props} />;
  }

  // Overlay mode: full-screen glass presentation, dismissible, only rendered
  // while enabled (deploy/rollback in progress) — doc 04 §2.
  return (
    <AnimatePresence>
      {props.enabled !== false ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="absolute inset-0 bg-inverse/60" onClick={props.onDismiss} aria-hidden="true" />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="deploy-overlay-solid-bg backdrop-blur-md relative z-10 max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-xl p-6 outline-none"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 id={titleId} className="text-lg font-semibold text-foreground">Deploying {props.appName}</h2>
              {props.onDismiss ? (
                <Button size="icon-sm" variant="ghost" onClick={props.onDismiss} aria-label="Dismiss">
                  <X className="size-4" />
                </Button>
              ) : null}
            </div>
            <DeployLiveViewInner {...props} />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
