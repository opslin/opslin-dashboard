import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

const toneClassName: Record<StatusTone, string> = {
  success: "bg-success-muted text-success-text",
  warning: "bg-warning-muted text-warning-text",
  danger: "bg-danger-muted text-danger-text",
  info: "bg-info-muted text-info-text",
  neutral: "bg-secondary text-muted-foreground",
};

const toneDotClassName: Record<StatusTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  neutral: "bg-muted-foreground",
};

/**
 * THE single source for status rendering across the app (design-system.md
 * §5) — replaces the 3 separate ad-hoc implementations that existed before
 * this (AppStatusBadge, DomainStatusBadge, components/admin/status-badge).
 * Every platform status maps to a tone + label here; unknown statuses fall
 * back to "neutral" with a title-cased label rather than throwing.
 */
const STATUS_REGISTRY: Record<string, { tone: StatusTone; label: string }> = {
  // App / deployment lifecycle
  running: { tone: "success", label: "Running" },
  deployed: { tone: "success", label: "Deployed" },
  succeeded: { tone: "success", label: "Succeeded" },
  active: { tone: "success", label: "Active" },
  deploying: { tone: "info", label: "Deploying" },
  building: { tone: "info", label: "Building" },
  pending: { tone: "info", label: "Pending" },
  connected: { tone: "info", label: "Connected" },
  ssl_pending: { tone: "info", label: "SSL Pending" },
  stopping: { tone: "neutral", label: "Stopping" },
  stopped: { tone: "neutral", label: "Stopped" },
  deleting: { tone: "neutral", label: "Deleting" },
  disabled: { tone: "neutral", label: "Disabled" },
  offline: { tone: "neutral", label: "Offline" },
  disconnected: { tone: "neutral", label: "Disconnected" },
  pending_dns: { tone: "warning", label: "Waiting for DNS" },
  misconfigured: { tone: "warning", label: "Needs DNS fix" },
  degraded: { tone: "warning", label: "Degraded" },
  warning: { tone: "warning", label: "Warning" },
  failed: { tone: "danger", label: "Failed" },
  error: { tone: "danger", label: "Error" },
  delete_failed: { tone: "danger", label: "Delete Failed" },
  unhealthy: { tone: "danger", label: "Unhealthy" },
  // Generic
  ok: { tone: "success", label: "OK" },
  healthy: { tone: "success", label: "Healthy" },
  online: { tone: "success", label: "Online" },
  info: { tone: "info", label: "Info" },
  // AlertSeverity ("INFO" | "WARN" | "CRIT")
  warn: { tone: "warning", label: "Warning" },
  crit: { tone: "danger", label: "Critical" },
};

function titleCase(status: string) {
  return status
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function resolveStatusMeta(status: string): { tone: StatusTone; label: string } {
  return STATUS_REGISTRY[status.toLowerCase()] ?? { tone: "neutral", label: titleCase(status) };
}

interface StatusBadgeProps {
  status: string;
  /** Override the registry's default label (e.g. to add contextual detail). */
  label?: string;
  /** Override the registry's default tone. */
  tone?: StatusTone;
  /** Use an icon instead of the default dot — status still never relies on color alone. */
  icon?: LucideIcon;
  className?: string;
}

export function StatusBadge({ status, label, tone, icon: Icon, className }: StatusBadgeProps) {
  const meta = resolveStatusMeta(status);
  const resolvedTone = tone ?? meta.tone;

  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium",
        toneClassName[resolvedTone],
        className
      )}
    >
      {Icon ? (
        <Icon className="size-3.5" aria-hidden="true" />
      ) : (
        <span className={cn("size-1.5 rounded-full", toneDotClassName[resolvedTone])} aria-hidden="true" />
      )}
      {label ?? meta.label}
    </span>
  );
}
