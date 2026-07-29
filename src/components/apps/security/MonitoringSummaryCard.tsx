"use client";

import Link from "next/link";
import { Activity, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AppMetricCurrent } from "@/lib/api";
import type { AppStatus } from "@/lib/security/shield-state";

/**
 * MonitoringSummaryCard — displays high-level health signals derived from
 * AppMetric (CPU, memory, restart count, runtime status) as static read-only
 * labels, plus a single navigational link to /monitoring.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 * Design: Property P13
 */

export interface MonitoringSummaryCardProps {
  metric: AppMetricCurrent | null;
  appStatusFallback: AppStatus;
}

/** Shared className for all metric value elements — ensures identical styling (Property P13). */
const METRIC_VALUE_CLASS = "text-sm font-semibold text-foreground";

/**
 * Formats a byte value into a human-readable string with a consistent unit.
 * Both used and limit are formatted with the same unit for clarity.
 */
function formatMemoryPair(
  used: number,
  limit: number
): { usedStr: string; limitStr: string; unit: string } {
  const units = ["B", "KB", "MB", "GB", "TB"];
  // Determine the unit based on the larger value (limit)
  const reference = Math.max(used, limit);
  let unitIndex = 0;
  let divisor = 1;

  while (reference / divisor >= 1024 && unitIndex < units.length - 1) {
    divisor *= 1024;
    unitIndex += 1;
  }

  const usedInUnit = used / divisor;
  const limitInUnit = limit / divisor;

  return {
    usedStr: usedInUnit >= 10 || unitIndex === 0 ? usedInUnit.toFixed(0) : usedInUnit.toFixed(1),
    limitStr: limitInUnit >= 10 || unitIndex === 0 ? limitInUnit.toFixed(0) : limitInUnit.toFixed(1),
    unit: units[unitIndex],
  };
}

/** Maps AppStatus enum to a user-facing display label. */
function statusLabel(status: string): string {
  switch (status.toLowerCase()) {
    case "running":
      return "Running";
    case "stopped":
      return "Stopped";
    case "deploying":
      return "Deploying";
    case "pending":
      return "Pending";
    case "error":
      return "Error";
    default:
      return status;
  }
}

export function MonitoringSummaryCard({
  metric,
  appStatusFallback,
}: MonitoringSummaryCardProps): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="size-4 text-muted-foreground" />
          Monitoring
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {metric === null ? (
          /* Empty state: no metrics available */
          <div
            className="flex items-center gap-2 text-sm text-muted-foreground"
            data-testid="monitoring-empty-state"
            role="status"
          >
            <Info className="size-4" />
            <span>Metrics are not yet available.</span>
          </div>
        ) : (
          /* Metric values: four read-only labels */
          <div className="grid grid-cols-2 gap-3" data-testid="monitoring-metrics">
            {/* Status */}
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <p className={METRIC_VALUE_CLASS} data-testid="metric-status">
                {statusLabel(metric.status ?? appStatusFallback)}
              </p>
            </div>

            {/* CPU% */}
            <div>
              <p className="text-xs text-muted-foreground">CPU</p>
              <p className={METRIC_VALUE_CLASS} data-testid="metric-cpu">
                {(metric.cpuPercent ?? 0).toFixed(1)}%
              </p>
            </div>

            {/* Memory used / limit */}
            <div>
              <p className="text-xs text-muted-foreground">Memory</p>
              <p className={METRIC_VALUE_CLASS} data-testid="metric-memory">
                {(() => {
                  const used = metric.memoryUsed ?? 0;
                  const limit = metric.memoryLimit ?? 0;
                  const { usedStr, limitStr, unit } = formatMemoryPair(used, limit);
                  return `${usedStr} / ${limitStr} ${unit}`;
                })()}
              </p>
            </div>

            {/* Restart count — MUST use identical className as other metric values (Property P13) */}
            <div>
              <p className="text-xs text-muted-foreground">Restarts</p>
              <p className={METRIC_VALUE_CLASS} data-testid="metric-restarts">
                {metric.restartCount ?? 0}
              </p>
            </div>
          </div>
        )}

        {/* Single navigational link to detailed monitoring */}
        <Link
          href="/monitoring"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
          data-testid="monitoring-link"
        >
          View detailed monitoring
        </Link>
      </CardContent>
    </Card>
  );
}
