"use client";

import { ExternalLink, RotateCw, Settings, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppStatusBadge } from "@/components/apps/AppStatusBadge";
import type { AppStatus } from "@/lib/security/shield-state";

/**
 * AppHeaderActions — Header region for the security-focused app details page.
 *
 * Renders the app name, type, status badge, and exactly three primary actions:
 * Open, Redeploy, and Settings.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 12.4
 */

export interface AppHeaderActionsProps {
  appName: string;
  appType: "NODEJS" | "STATIC" | string;
  appStatus: AppStatus; // "pending" | "deploying" | "running" | "stopped" | "error"
  domainConfigured: boolean;
  appUrl: string | null; // computed, null when no fallback exists
  onRedeploy: () => void;
  onOpenSettings: () => void;
  redeployState: "idle" | "in-progress";
}

/**
 * Determines the reason the Open action is disabled.
 * Returns null when the action should be enabled.
 */
function getDisabledReason(
  appStatus: AppStatus,
  domainConfigured: boolean
): string | null {
  if (appStatus !== "running") {
    return "App is not running";
  }
  if (!domainConfigured) {
    return "No domain configured";
  }
  return null;
}

export function AppHeaderActions({
  appName,
  appType,
  appStatus,
  domainConfigured,
  appUrl,
  onRedeploy,
  onOpenSettings,
  redeployState,
}: AppHeaderActionsProps) {
  const disabledReason = getDisabledReason(appStatus, domainConfigured);
  const openEnabled = disabledReason === null;

  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      {/* App identity: name, type, and status badge */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {appName}
          </h1>
          <AppStatusBadge status={appStatus} />
        </div>
        <p className="text-sm text-muted-foreground">{appType}</p>
      </div>

      {/* Primary actions: Open, Redeploy, Settings */}
      <div className="flex items-center gap-2">
        {/* Open action */}
        {openEnabled ? (
          <Button variant="outline" size="sm" asChild>
            <a
              href={appUrl ?? "#"}
              target="_blank"
              rel="noopener"
              aria-label={`Open ${appName}`}
            >
              <ExternalLink className="size-4" />
              Open
            </a>
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            aria-disabled="true"
            aria-label={`Open ${appName} (${disabledReason})`}
            tabIndex={0}
            onClick={(e) => e.preventDefault()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
              }
            }}
            className="pointer-events-auto opacity-50 cursor-not-allowed"
          >
            <ExternalLink className="size-4" />
            Open
          </Button>
        )}

        {/* Redeploy action */}
        <Button
          variant="outline"
          size="sm"
          onClick={onRedeploy}
          disabled={redeployState === "in-progress"}
          aria-label={
            redeployState === "in-progress"
              ? "Redeploying..."
              : `Redeploy ${appName}`
          }
        >
          {redeployState === "in-progress" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RotateCw className="size-4" />
          )}
          Redeploy
        </Button>

        {/* Settings action */}
        <Button variant="outline" size="sm" onClick={onOpenSettings}>
          <Settings className="size-4" />
          Settings
        </Button>
      </div>
    </header>
  );
}
