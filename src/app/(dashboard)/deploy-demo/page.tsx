"use client";

/**
 * Deploy-experience QA harness (doc 04 §2): feeds scripted `phase_progress`
 * events through the real `DeployLiveView` via its `demoOverride` prop,
 * which folds them through the exact same reducers
 * (`reducePhaseStates`/`reduceStepTimestamps`/`mergeVuData`) the live
 * WebSocket hook uses. No network calls, no WebSocket — every state this
 * page can show is one the real deploy screens can also show, just reached
 * here by scripted playback instead of a live VPS. `demoOverride` is never
 * passed anywhere outside this page.
 */

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DeploymentRecord } from "@/lib/api";
import { DeployLiveView, type DeployLiveDemoOverride } from "@/components/deploy/live/deploy-live-view";
import { DEMO_SCENARIOS, buildScenario, type BuiltScenario } from "./scenarios";

const PLAYBACK_INTERVAL_MS = 500;

function deploymentForStep(built: BuiltScenario, stepIndex: number): DeploymentRecord {
  if (stepIndex >= built.events.length) return built.finalDeployment;
  if (stepIndex === 0) return { ...built.runningDeployment, status: "pending" };
  return built.runningDeployment;
}

export default function DeployDemoPage() {
  const [scenarioId, setScenarioId] = useState(DEMO_SCENARIOS[0].id);
  const [t0, setT0] = useState(() => Date.now());
  const scenario = DEMO_SCENARIOS.find((s) => s.id === scenarioId) ?? DEMO_SCENARIOS[0];
  const built = useMemo(() => buildScenario(scenario, t0), [scenario, t0]);

  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);

  // Adjust playback state when the selected scenario (or its rebuilt t0)
  // changes — computed during render, not inside a useEffect, matching the
  // pattern already established in use-deploy-announcer.ts for this
  // codebase's react-hooks/set-state-in-effect rule.
  const currentKey = `${scenarioId}:${t0}`;
  const [resetKey, setResetKey] = useState(currentKey);
  if (currentKey !== resetKey) {
    setResetKey(currentKey);
    setStepIndex(0);
    setPlaying(false);
  }

  // Derived, not stored: "actually playing" also requires not being at the
  // end of the scripted events. Computing this at render time (rather than
  // syncing it back into `playing` via setState-in-effect) avoids the
  // cascading-render lint rule this codebase enforces.
  const atEnd = stepIndex >= built.events.length;
  const isPlaying = playing && !atEnd;

  useEffect(() => {
    if (!isPlaying) return;
    // Re-scheduled on every stepIndex change so playback advances one step
    // per tick instead of firing once and stopping.
    const timer = setTimeout(
      () => setStepIndex((i) => Math.min(i + 1, built.events.length)),
      PLAYBACK_INTERVAL_MS
    );
    return () => clearTimeout(timer);
  }, [isPlaying, stepIndex, built.events.length]);

  const deployment = deploymentForStep(built, stepIndex);

  const demoOverride: DeployLiveDemoOverride = {
    events: built.events.slice(0, stepIndex),
    deployment,
    connectionStatus: scenario.connectionStatus ?? "connected",
    lastEventAt: built.lastEventAtOverride,
  };

  const restart = () => setT0(Date.now());

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Deploy experience QA harness</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Renders the real <code className="rounded bg-secondary px-1">DeployLiveView</code>, driven by scripted
            events instead of a live VPS. Every step ID, phase, and reducer here is the real one — only the
            deployment identity and timing are simulated.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scenario</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {DEMO_SCENARIOS.map((s) => (
              <button
                key={s.id}
                onClick={() => setScenarioId(s.id)}
                className={cn(
                  "rounded-[var(--opslin-radius-lg)] border px-3 py-1.5 text-sm font-medium transition-colors",
                  s.id === scenarioId
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:bg-secondary/60"
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{scenario.description}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-4">
          <Button size="sm" variant="outline" onClick={() => setStepIndex((i) => Math.max(i - 1, 0))}>
            <SkipBack className="size-3.5" />
            Step back
          </Button>
          <Button size="sm" variant={isPlaying ? "outline" : "default"} onClick={() => setPlaying((p) => !p)}>
            {isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            {isPlaying ? "Pause" : "Play"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setStepIndex((i) => Math.min(i + 1, built.events.length))}
          >
            <SkipForward className="size-3.5" />
            Step forward
          </Button>
          <Button size="sm" variant="ghost" onClick={restart}>
            <RotateCcw className="size-3.5" />
            Restart
          </Button>
          <span className="ml-2 font-mono text-xs text-muted-foreground">
            Step {stepIndex} / {built.events.length}
          </span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowOverlay(true)}>
              Show overlay
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <DeployLiveView
            mode="inline"
            appId={scenario.appId}
            deploymentId={built.deploymentId}
            appName={scenario.appName}
            appDomain={scenario.appDomain}
            serverName={scenario.serverName}
            serverConnected={scenario.serverConnected}
            logs={scenario.logs}
            preflightChecks={scenario.preflightChecks}
            demoOverride={demoOverride}
            onRetry={restart}
            onRollback={() => toast("Demo: rollback would be requested here")}
            rollbackAvailable={Boolean(deployment.previousSha)}
          />
        </div>
      </div>

      <DeployLiveView
        mode="overlay"
        appId={scenario.appId}
        deploymentId={built.deploymentId}
        appName={scenario.appName}
        appDomain={scenario.appDomain}
        serverName={scenario.serverName}
        serverConnected={scenario.serverConnected}
        logs={scenario.logs}
        preflightChecks={scenario.preflightChecks}
        demoOverride={demoOverride}
        enabled={showOverlay}
        onDismiss={() => setShowOverlay(false)}
        onRetry={restart}
        onRollback={() => toast("Demo: rollback would be requested here")}
        rollbackAvailable={Boolean(deployment.previousSha)}
      />
    </div>
  );
}
