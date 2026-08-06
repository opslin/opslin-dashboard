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
export function resolveEffectiveHealthLabel(
  current?: Partial<Pick<AppMetricCurrent, "healthStatus" | "effectiveStatus">> | null
): "offline" | "stale" | "unhealthy" | "healthy" | "unknown" {
  const effective = current?.effectiveStatus;
  if (effective === "offline" || effective === "stale" || effective === "unhealthy") {
    return effective;
  }
  const raw = (current?.healthStatus || "unknown").toLowerCase();
  return raw === "healthy" || raw === "unhealthy" ? raw : "unknown";
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
