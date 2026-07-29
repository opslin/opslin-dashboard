"use client";

/**
 * DeployContextRail — doc 04 §4 "Context rail" panel. Every field maps to a
 * real, verifiable source (doc 04 §7): agent/server connection (existing
 * server record), health (`healthPassed` from the real `phase_progress`
 * validation data), rollback target (`Deployment.previousSha`). A field with
 * no real source is omitted entirely rather than rendered as a guess or a
 * decorative placeholder.
 */

import { CheckCircle2, HeartPulse, Loader2, RotateCcw, Server } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DeployContextRailProps {
  serverName?: string | null;
  serverConnected?: boolean;
  /** From the real `vu_running`/`health_passed` phase_progress data — undefined until health has actually been probed. */
  healthPassed?: boolean;
  previousSha?: string | null;
  className?: string;
}

function RailRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Server;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 text-sm">
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto font-medium text-foreground">{children}</span>
    </div>
  );
}

export function DeployContextRail({
  serverName,
  serverConnected,
  healthPassed,
  previousSha,
  className,
}: DeployContextRailProps) {
  const hasAnyField = serverName !== undefined || healthPassed !== undefined || Boolean(previousSha);
  if (!hasAnyField) {
    return null;
  }

  return (
    <div className={cn("space-y-3 rounded-lg border border-border/70 bg-card p-4", className)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Context</p>
      <div className="space-y-2.5">
        {serverName !== undefined ? (
          <RailRow icon={Server} label="Server">
            <span
              className={cn(
                "inline-flex items-center gap-1.5",
                serverConnected === false ? "text-danger-text" : "text-foreground"
              )}
            >
              {serverName ?? "Unknown"}
              {serverConnected === false ? " (disconnected)" : ""}
            </span>
          </RailRow>
        ) : null}
        {healthPassed !== undefined ? (
          <RailRow icon={HeartPulse} label="Health">
            {healthPassed ? (
              <span className="inline-flex items-center gap-1.5 text-success-text">
                <CheckCircle2 className="size-3.5" aria-hidden="true" /> Passed
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-info-text">
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Probing
              </span>
            )}
          </RailRow>
        ) : null}
        {previousSha ? (
          <RailRow icon={RotateCcw} label="Rollback target">
            <span className="font-mono text-xs">{previousSha.slice(0, 7)}</span>
          </RailRow>
        ) : null}
      </div>
    </div>
  );
}
