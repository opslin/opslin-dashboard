/**
 * SecuritySummaryCard — displays the current plan tier, security score,
 * security status label, and a plain-language description. Shows a
 * non-blocking in-region indicator while the app is deploying.
 *
 * Requirements: 5.1, 5.2, 5.4, 5.5, 5.6, 5.7, 5.8
 */

import { ShieldCheck, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PlanTier } from "@/lib/security/plan-bundle-map";
import type { SecurityStatus } from "@/lib/security/shield-state";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SecuritySummaryCardProps {
  planTier: PlanTier | null; // null => "Unknown" label
  score: number; // 0..100, integer
  status: SecurityStatus; // "At_Risk"|"Basic"|"Protected"|"Hardened"|"Fortified"
  description: string; // localized SECURITY_STATUS_DESCRIPTIONS[status]
  isDeploying: boolean; // shows in-region indicator while DEPLOYING
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Maps SecurityStatus to a display-friendly label. */
function formatStatusLabel(status: SecurityStatus): string {
  switch (status) {
    case "At_Risk":
      return "At Risk";
    case "Basic":
      return "Basic";
    case "Protected":
      return "Protected";
    case "Hardened":
      return "Hardened";
    case "Fortified":
      return "Fortified";
  }
}

/** Maps SecurityStatus to a color class for the score/status badge area. */
function statusColorClass(status: SecurityStatus): string {
  switch (status) {
    case "At_Risk":
      return "text-muted-foreground";
    case "Basic":
      return "text-muted-foreground";
    case "Protected":
      return "text-[var(--opslin-info-default)]";
    case "Hardened":
      return "text-[var(--opslin-info-default)]";
    case "Fortified":
      return "text-success-text";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SecuritySummaryCard({
  planTier,
  score,
  status,
  description,
  isDeploying,
}: SecuritySummaryCardProps): React.JSX.Element {
  const displayPlan = planTier ?? "Unknown";
  const statusLabel = formatStatusLabel(status);
  const colorClass = statusColorClass(status);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4 text-muted-foreground" />
          Security Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Plan tier and score row */}
        <div className="flex items-center justify-between gap-4">
          {/* Plan tier label */}
          <div>
            <p className="text-xs text-muted-foreground">Plan</p>
            <p
              className="text-sm font-semibold text-foreground"
              data-testid="security-plan-tier"
            >
              {displayPlan}
            </p>
          </div>

          {/* Security score */}
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Score</p>
            <p
              className={`text-2xl font-bold ${colorClass}`}
              data-testid="security-score"
            >
              {score}
            </p>
          </div>
        </div>

        {/* Status label */}
        <div>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              status === "Fortified"
                ? "bg-success-muted text-success"
                : status === "Protected" || status === "Hardened"
                  ? "bg-[var(--opslin-info-muted)] text-[var(--opslin-info-default)]"
                  : "bg-muted text-muted-foreground"
            }`}
            data-testid="security-status"
          >
            {statusLabel}
          </span>
        </div>

        {/* Description */}
        <p
          className="text-sm text-muted-foreground leading-relaxed"
          data-testid="security-description"
        >
          {description}
        </p>

        {/* Deploying indicator — non-blocking, in-region */}
        {isDeploying && (
          <div
            className="flex items-center gap-2 rounded-md bg-muted px-3 py-2"
            data-testid="deploying-indicator"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Applying protections...
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
