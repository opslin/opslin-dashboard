import type { AppMetricCurrent, AppMetricHistory } from "@/lib/api";

export function formatBytes(value?: number | null) {
  const bytes = Math.max(0, Number(value || 0));
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size >= 10 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`;
}

export function formatDuration(seconds?: number | null) {
  const totalSeconds = Math.max(0, Math.floor(Number(seconds || 0)));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function memoryPercent(metric?: Pick<AppMetricCurrent, "memoryUsed" | "memoryLimit" | "memoryPercent"> | null) {
  if (!metric) return 0;
  if (typeof metric.memoryPercent === "number" && Number.isFinite(metric.memoryPercent)) {
    return Math.max(0, Math.min(100, metric.memoryPercent));
  }
  if (!metric.memoryLimit) return 0;
  return Math.max(0, Math.min(100, ((metric.memoryUsed || 0) / metric.memoryLimit) * 100));
}

// `effectiveStatus` (real-time — layers server connectivity + health-check staleness on top of
// the last-persisted `healthStatus` row, see opslin-api's computeEffectiveAppStatus) is what
// should actually be displayed. The raw `healthStatus` column stops updating the instant the
// agent disconnects, so showing it alone can read "healthy" for a server that's been offline
// for hours. Falls back to the raw value only when the API response predates this field.
//
// `serverConnected` is checked directly, ahead of `effectiveStatus`: `computeEffectiveAppStatus`
// only overrides to "offline" while `App.status === "running"` (by design — a stopped/errored app
// should still read "stopped"/"error" as its lifecycle status elsewhere). But this health widget
// isn't showing lifecycle status, it's showing live reachability — which is exactly "no" whenever
// the server's disconnected, regardless of what status the app was last in. Without this check, an
// app whose last deploy failed (status "error") but whose server later disconnects falls through
// effectiveStatus's non-"running" passthrough and displays its last known (possibly days-stale)
// healthStatus as if it were current.
export function resolveEffectiveHealthLabel(
  current?: Partial<Pick<AppMetricCurrent, "healthStatus" | "effectiveStatus" | "serverConnected">> | null
): "offline" | "stale" | "unhealthy" | "healthy" | "unknown" {
  if (current?.serverConnected === false) {
    return "offline";
  }
  const effective = current?.effectiveStatus;
  if (effective === "offline" || effective === "stale" || effective === "unhealthy") {
    return effective;
  }
  const raw = (current?.healthStatus || "unknown").toLowerCase();
  return raw === "healthy" || raw === "unhealthy" ? raw : "unknown";
}

// Real-time metrics are pushed by the agent; while its server is known-disconnected, nothing new
// will ever arrive, so polling every `baseIntervalMs` (default 60s) just repeats the same stale
// answer against real backend load (ClickHouse/Postgres query + isAgentConnected's Redis check)
// for no benefit. Back off hard once we know; a normal-cadence poll resumes automatically the
// moment `serverConnected` flips back to true.
export const OFFLINE_METRICS_REFETCH_MS = 5 * 60_000;

export function resolveMetricsRefetchInterval(
  serverConnected: boolean | undefined,
  baseIntervalMs: number
): number {
  return serverConnected === false ? OFFLINE_METRICS_REFETCH_MS : baseIntervalMs;
}

export function latestMetricPoint(history?: AppMetricHistory | null) {
  const index = history?.series.timestamps.length ? history.series.timestamps.length - 1 : -1;
  if (index < 0 || !history) {
    return null;
  }
  return {
    timestamp: history.series.timestamps[index],
    cpu: history.series.cpu[index] || 0,
    memory: history.series.memoryPercent[index] || 0,
    restartCount: history.series.restartCount[index] || 0,
  };
}
