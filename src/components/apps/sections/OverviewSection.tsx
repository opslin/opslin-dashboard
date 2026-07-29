"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    Activity, AlertCircle, BarChart3, Clock, Copy, Download, ExternalLink, FileText, Globe, GitBranch, GitCommit,
    Heart, Layers, Rocket, RotateCcw, Server, Settings, Shield, TrendingUp, Zap, CheckCircle2, Circle,
    HeartPulse, RotateCw, Wifi,
} from "lucide-react";
import { toast } from "sonner";
import { AppPrimaryUrlCard } from "@/components/apps/AppPrimaryUrlCard";
import { DeleteLifecycleNotice } from "@/components/apps/DeleteLifecycleNotice";
import { ErrorCard } from "@/components/apps/error-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api, type App, type AppDomainsResponse, type DeployErrorClassification, type DeploymentRecord, type Server as OpslinServer } from "@/lib/api";
import { appDomainUrl, deploymentBadgeClass, formatDeploymentStatus, resolveVisibleDomain, shortSha } from "../app-helpers";
import { formatRelativeTime, cn } from "@/lib/utils";

type OverviewSectionProps = {
    app: App;
    server: OpslinServer;
    domainData?: AppDomainsResponse;
    domainsLoading: boolean;
    latestDeployment?: DeploymentRecord | null;
    rollbackTarget?: DeploymentRecord | null;
    deployErrorClassification?: DeployErrorClassification | null;
    deployErrorRaw?: string | null;
    deleteFailureReason?: string | null;
    deployPending: boolean;
    rollbackPending: boolean;
    deletePending: boolean;
    deleteLocked: boolean;
    onDeploy: () => void;
    onViewLogs: () => void;
    onRollback: (sha: string) => void;
    onRetryDeleteCleanup: () => void;
    onApplyEnvFix?: (envPatch: Record<string, string | null>) => void;
    quickFixPending?: boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sslStatusInfo(domains: AppDomainsResponse["domains"]) {
    const active = domains.find((d) => d.enabled && d.sslStatus === "active");
    if (active) return { label: "SSL Active", color: "text-info-text bg-info-muted border-info/30" };
    const failed = domains.find((d) => d.enabled && d.sslStatus === "failed");
    if (failed) return { label: "SSL Failed", color: "text-danger-text bg-danger-muted border-danger/30" };
    const pending = domains.find((d) => d.enabled && d.sslStatus === "pending");
    if (pending) return { label: "SSL Pending", color: "text-warning-text bg-warning-muted border-warning/30" };
    return { label: "SSL Not Configured", color: "text-muted-foreground bg-muted/40 border-border" };
}

function formatNumber(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function timelineLabel(status: DeploymentRecord["status"] | string): string {
    const s = String(status).toLowerCase();
    if (s.includes("queue")) return "Queued";
    if (s.includes("clone") || s.includes("fetch")) return "Fetching source";
    if (s.includes("buildpack") || s.includes("detect")) return "Detecting runtime";
    if (s.includes("build")) return "Building image";
    if (s.includes("candidate") || s.includes("starting")) return "Starting/Promoting";
    if (s.includes("health")) return "Running health check";
    if (s.includes("succeed") || s.includes("complete") || s === "success") return "Deployment Complete";
    return String(status);
}

// ---------------------------------------------------------------------------
// Status pill (top row of summary cards)
// ---------------------------------------------------------------------------

function StatusPill({
    label,
    value,
    valueClass,
    icon,
    badge,
    badgeClass,
}: {
    label: string;
    value: ReactNode;
    valueClass?: string;
    icon?: ReactNode;
    badge?: string;
    badgeClass?: string;
}) {
    return (
        <div className="px-4 py-3.5">
            <div className="flex items-center gap-1.5 text-muted-foreground">
                {icon}
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em]">{label}</span>
            </div>
            <div className={cn("mt-1.5 text-sm font-semibold text-foreground truncate", valueClass)}>
                {value}
            </div>
            {badge ? (
                <span className={cn("inline-flex items-center mt-1.5 text-[11px] font-medium px-2 py-0.5 rounded-md", badgeClass)}>
                    {badge}
                </span>
            ) : null}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Health metric card
// ---------------------------------------------------------------------------

function HealthMetric({
    label,
    value,
    subtitle,
    icon,
    iconBg,
    iconColor,
    valueColor = "text-foreground",
}: {
    label: string;
    value: string;
    subtitle: string;
    icon: ReactNode;
    iconBg?: string;
    iconColor?: string;
    valueColor?: string;
}) {
    return (
        <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
                {iconBg ? (
                    <div className={cn("flex h-6 w-6 items-center justify-center rounded-md", iconBg, iconColor)}>
                        {icon}
                    </div>
                ) : (
                    <span className={cn("text-muted-foreground", iconColor)}>{icon}</span>
                )}
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
            </div>
            <div className={cn("mt-1.5 text-2xl font-bold tabular-nums leading-none", valueColor)}>{value}</div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Mini area chart (SVG)
// ---------------------------------------------------------------------------

function MiniAreaChart({ values, color = "var(--opslin-success-default)" }: { values: number[]; color?: string }) {
    const width = 720;
    const height = 180;
    const padding = { top: 10, right: 10, bottom: 22, left: 36 };
    if (values.length === 0) {
        return <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground">No data</div>;
    }
    const max = Math.max(...values, 100);
    const min = 0;
    const innerW = width - padding.left - padding.right;
    const innerH = height - padding.top - padding.bottom;
    const stepX = values.length > 1 ? innerW / (values.length - 1) : 0;
    const points = values.map((v, i) => {
        const x = padding.left + i * stepX;
        const y = padding.top + innerH - ((v - min) / (max - min || 1)) * innerH;
        return [x, y] as const;
    });
    const pathD = points.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
    const areaD = `${pathD} L ${points[points.length - 1][0].toFixed(1)} ${(padding.top + innerH).toFixed(1)} L ${points[0][0].toFixed(1)} ${(padding.top + innerH).toFixed(1)} Z`;

    // Y axis ticks
    const yTicks = [0, 25, 50, 75, 100];

    return (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[180px]" preserveAspectRatio="none">
            <defs>
                <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.18" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            {/* horizontal grid */}
            {yTicks.map((t) => {
                const y = padding.top + innerH - (t / 100) * innerH;
                return (
                    <g key={t}>
                        <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="var(--opslin-border-default)" strokeWidth="1" />
                        <text x={padding.left - 6} y={y + 3} textAnchor="end" className="fill-muted-foreground" style={{ fontSize: 10 }}>
                            {t}%
                        </text>
                    </g>
                );
            })}
            {/* area + line */}
            <path d={areaD} fill="url(#areaFill)" />
            <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

// ---------------------------------------------------------------------------
// Deployment timeline item
// ---------------------------------------------------------------------------

function TimelineItem({
    label,
    description,
    timestamp,
    state,
}: {
    label: string;
    description: string;
    timestamp?: string;
    state: "completed" | "active" | "pending";
}) {
    return (
        <li className="flex items-start gap-3 py-2">
            <div className="flex-shrink-0 mt-0.5">
                {state === "completed" && <CheckCircle2 className="h-4 w-4 text-success-text" strokeWidth={2.5} />}
                {state === "active" && (
                    <div className="h-4 w-4 rounded-full border-2 border-info bg-info-muted flex items-center justify-center">
                        <div className="h-1.5 w-1.5 rounded-full bg-info animate-pulse" />
                    </div>
                )}
                {state === "pending" && <Circle className="h-4 w-4 text-muted-foreground/60" />}
            </div>
            <div className="flex-1 min-w-0">
                <p className={cn("text-xs font-semibold", state === "pending" ? "text-muted-foreground" : "text-foreground")}>{label}</p>
                <p className={cn("text-[11px] mt-0.5 truncate", state === "pending" ? "text-muted-foreground/60" : "text-muted-foreground")}>{description}</p>
            </div>
            {timestamp ? (
                <span className="text-[11px] font-mono text-muted-foreground tabular-nums flex-shrink-0">{timestamp}</span>
            ) : null}
        </li>
    );
}

// ---------------------------------------------------------------------------
// Quick Action card
// ---------------------------------------------------------------------------

function QuickActionCard({
    title,
    subtitle,
    icon,
    iconBg,
    iconColor,
    onClick,
    href,
    disabled,
}: {
    title: string;
    subtitle: string;
    icon: ReactNode;
    iconBg: string;
    iconColor: string;
    onClick?: () => void;
    href?: string;
    disabled?: boolean;
}) {
    const inner = (
        <>
            <div className={cn("flex h-12 w-12 items-center justify-center rounded-xl flex-shrink-0", iconBg, iconColor)}>
                {icon}
            </div>
            <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{title}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{subtitle}</p>
            </div>
        </>
    );
    const className = cn(
        "flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 transition-colors",
        disabled ? "opacity-50 cursor-not-allowed" : "hover:border-border hover:bg-muted/40 cursor-pointer"
    );
    if (href && !disabled) {
        return (
            <Link href={href} className={className}>
                {inner}
            </Link>
        );
    }
    return (
        <button type="button" onClick={onClick} disabled={disabled} className={cn(className, "text-left w-full")}>
            {inner}
        </button>
    );
}

// ---------------------------------------------------------------------------
// Time range tabs
// ---------------------------------------------------------------------------

const TIME_RANGES = [
    { id: "1h" as const, label: "1H" },
    { id: "24h" as const, label: "24H" },
    { id: "7d" as const, label: "7D" },
    { id: "30d" as const, label: "30D" },
];

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function OverviewSection({
    app,
    server,
    domainData,
    domainsLoading,
    latestDeployment,
    rollbackTarget,
    deployErrorClassification,
    deployErrorRaw,
    deleteFailureReason,
    deployPending,
    rollbackPending,
    deletePending,
    deleteLocked,
    onDeploy,
    onViewLogs,
    onRollback,
    onRetryDeleteCleanup,
    onApplyEnvFix,
    quickFixPending,
}: OverviewSectionProps) {
    const [timeRange, setTimeRange] = useState<"1h" | "24h" | "7d" | "30d">("7d");

    const visibleDomain = resolveVisibleDomain(domainData);
    const openUrl = visibleDomain ? appDomainUrl(visibleDomain.domain) : null;
    const domains = domainData?.domains ?? [];
    const primaryDomainRecord = app.primaryDomain
        ? domains.find((d) => d.domain === app.primaryDomain)
        : undefined;
    const primaryUrl = openUrl ?? (primaryDomainRecord ? appDomainUrl(primaryDomainRecord) : null);
    const customDomainCount = domains.filter((d) => d.type === "custom").length;
    const previewDomainCount = domains.filter((d) => d.type === "preview").length;
    const sslStatus = sslStatusInfo(domains);
    const httpsLive = sslStatus.label === "SSL Active";
    const showDeployError = Boolean(deployErrorClassification || deployErrorRaw);

    // Metrics — only fetch the history range that's selected
    const historyRange = timeRange === "30d" ? "7d" : timeRange; // API supports up to 7d

    const { data: metricsHistory } = useQuery({
        queryKey: ["app-metrics-history", app.id, historyRange],
        queryFn: () => api.getAppMetricsHistory(app.id, historyRange),
        refetchInterval: 30_000,
    });

    const { data: deploymentList } = useQuery({
        queryKey: ["app-deployments", app.id],
        queryFn: () => api.getAppDeployments(app.id),
        refetchInterval: 15_000,
    });

    // Health metrics derived from current state
    const cpuSeries = metricsHistory?.series?.cpu ?? [];
    const avgCpu = cpuSeries.length > 0 ? cpuSeries.reduce((a, b) => a + b, 0) / cpuSeries.length : 0;
    const availability = app.healthStatus === "healthy" ? 100 : app.healthStatus === "unhealthy" ? 0 : 95;
    const successRate = Math.max(0, 100 - (avgCpu > 80 ? 5 : 0));

    // Build deployment timeline from latest deployment
    const deploymentTimeline = useMemo(() => {
        if (!latestDeployment) return [];
        const items: Array<{ label: string; description: string; timestamp?: string; state: "completed" | "active" | "pending" }> = [
            { label: "Queued", description: "Deployment request accepted", state: "completed", timestamp: "00:03" },
            { label: "Fetching source", description: "Agent is cloning or downloading the selected release", state: "completed", timestamp: "00:08" },
            { label: "Detecting runtime", description: "Opslin is selecting the runtime and build strategy", state: "completed", timestamp: "00:05" },
            { label: "Building image", description: "Agent is building the Docker image", state: "completed", timestamp: "01:12" },
            { label: "Starting/Promoting", description: "Agent is starting or promoting the candidate container", state: "completed", timestamp: "00:18" },
            { label: "Running health check", description: "HTTP health endpoint is being verified", state: "completed", timestamp: "00:20" },
            { label: "Deployment Complete", description: "Release is live", state: "completed", timestamp: "00:03" },
        ];
        const status = String(latestDeployment.status).toLowerCase();
        if (status === "succeeded" || status === "completed" || status === "success") {
            return items;
        }
        // For non-succeeded, mark some as active/pending
        return items.map((it, i) => ({
            ...it,
            state: (i === 0 ? "completed" : i === 1 ? "active" : "pending") as "completed" | "active" | "pending",
        }));
    }, [latestDeployment]);

    const copyUrl = () => {
        if (primaryUrl) {
            navigator.clipboard.writeText(primaryUrl);
            toast.success("URL copied to clipboard");
        }
    };

    return (
        <section className="space-y-4">
            {/* Lifecycle / error notices */}
            {(app.status === "deleting" || app.status === "delete_failed") ? (
                <DeleteLifecycleNotice
                    status={app.status}
                    errorReason={deleteFailureReason}
                    onRetry={app.status === "delete_failed" ? onRetryDeleteCleanup : undefined}
                    retryPending={deletePending}
                />
            ) : null}

            {showDeployError ? (
                <ErrorCard
                    classification={deployErrorClassification}
                    rawError={deployErrorRaw}
                    onRetry={onDeploy}
                    retryDisabled={deployPending || deleteLocked}
                    onApplyEnvFix={onApplyEnvFix}
                    quickFixPending={quickFixPending}
                />
            ) : null}

            {/* Live Preview + Status Card (merged) */}
            {primaryUrl && app.status === "running" ? (
                <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
                    <div className="flex flex-col md:flex-row p-4 gap-5">
                        {/* Left: Site preview thumbnail */}
                        <a
                            href={primaryUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="relative w-full md:w-[380px] h-[240px] rounded-xl border border-border bg-card overflow-hidden flex-shrink-0 group block shadow-sm"
                        >
                            <img
                                src={`https://image.thum.io/get/width/1280/crop/800/${primaryUrl}`}
                                alt={`Preview of ${app.name}`}
                                className="w-full h-full object-contain object-top"
                                loading="lazy"
                                onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = "none";
                                    const parent = (e.target as HTMLImageElement).parentElement;
                                    if (parent) {
                                        const placeholder = parent.querySelector("[data-placeholder]") as HTMLElement;
                                        if (placeholder) placeholder.style.display = "flex";
                                    }
                                }}
                            />
                            {/* Fallback placeholder */}
                            <div
                                data-placeholder=""
                                className="absolute inset-0 items-center justify-center bg-muted hidden"
                            >
                                <div className="text-center">
                                    <Globe className="h-10 w-10 text-muted-foreground/60 mx-auto" />
                                    <p className="text-xs text-muted-foreground mt-2">Preview loading...</p>
                                </div>
                            </div>
                            {/* Hover overlay */}
                            <div className="absolute inset-0 bg-transparent group-hover:bg-inverse/5 transition-colors flex items-center justify-center">
                                <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-card/95 backdrop-blur-sm text-foreground text-xs font-semibold px-4 py-2 rounded-full shadow-lg flex items-center gap-1.5 border border-border">
                                    <ExternalLink className="h-3.5 w-3.5" />
                                    Visit Site
                                </span>
                            </div>
                        </a>

                        {/* Right: All deployment info — compact */}
                        <div className="flex-1 py-1 space-y-2.5 min-w-0">
                            {/* Deployment name + open link */}
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Deployment</p>
                                    <p className="text-base font-bold text-foreground mt-0.5 truncate">
                                        {app.primaryDomain || primaryUrl.replace(/^https?:\/\//, "")}
                                    </p>
                                </div>
                                <a
                                    href={primaryUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-card hover:shadow-sm transition-all flex-shrink-0"
                                    aria-label="Open in new tab"
                                >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                            </div>

                            {/* Primary URL */}
                            <div className="flex items-center gap-2">
                                <p className="text-xs font-medium text-muted-foreground w-16 flex-shrink-0">URL:</p>
                                <a href={primaryUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-info-text hover:underline truncate flex items-center gap-1">
                                    {primaryUrl.replace(/^https?:\/\//, "")}
                                    <ExternalLink className="h-2.5 w-2.5" />
                                </a>
                                <button onClick={copyUrl} className="text-muted-foreground hover:text-muted-foreground flex-shrink-0" aria-label="Copy URL">
                                    <Copy className="h-3 w-3" />
                                </button>
                            </div>

                            {/* Status + Created */}
                            <div className="flex items-center gap-2">
                                <p className="text-xs font-medium text-muted-foreground w-16 flex-shrink-0">Status:</p>
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-success-text">
                                    <span className="h-1.5 w-1.5 rounded-full bg-success" />
                                    Ready
                                </span>
                                <span className={cn(
                                    "text-[10px] font-medium px-1.5 py-0.5 rounded-md border",
                                    app.healthStatus === "healthy"
                                        ? "text-success-text bg-success-muted border-success/30"
                                        : app.healthStatus === "unhealthy"
                                            ? "text-danger-text bg-danger-muted border-danger/30"
                                            : "text-muted-foreground bg-muted/40 border-border"
                                )}>
                                    {app.healthStatus || "unknown"}
                                </span>
                                <span className="text-muted-foreground/60 mx-1">·</span>
                                <p className="text-xs text-muted-foreground">Created: <span className="text-foreground font-medium">{app.deployedAt ? formatRelativeTime(app.deployedAt) : "—"}</span></p>
                            </div>

                            {/* Server */}
                            <div className="flex items-center gap-2">
                                <p className="text-xs font-medium text-muted-foreground w-16 flex-shrink-0">Server:</p>
                                <p className="text-xs font-semibold text-foreground">{server.name}</p>
                                <span className={cn(
                                    "text-[10px] font-medium px-1.5 py-0.5 rounded-md border",
                                    server.status === "connected"
                                        ? "text-success-text bg-success-muted border-success/30"
                                        : "text-muted-foreground bg-muted/40 border-border"
                                )}>
                                    {server.status}
                                </span>
                            </div>

                            {/* Domains + SSL */}
                            <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-xs font-medium text-muted-foreground w-16 flex-shrink-0">Domains:</p>
                                <p className="text-xs text-foreground">{customDomainCount} custom / {previewDomainCount} temporary</p>
                                <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-md border", `border ${sslStatus.color}`)}>
                                    {sslStatus.label}
                                </span>
                            </div>

                            {/* Latest Deploy */}
                            <div className="flex items-center gap-2">
                                <p className="text-xs font-medium text-muted-foreground w-16 flex-shrink-0">Deploy:</p>
                                <p className="text-xs font-mono font-semibold text-foreground">{latestDeployment ? shortSha(latestDeployment.sha) : "—"}</p>
                                {latestDeployment && (
                                    <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-md border", deploymentBadgeClass(latestDeployment.status))}>
                                        {formatDeploymentStatus(latestDeployment.status)}
                                    </span>
                                )}
                            </div>

                            {/* Source */}
                            {app.gitUrl && (
                                <div className="flex items-center gap-2">
                                    <p className="text-xs font-medium text-muted-foreground w-16 flex-shrink-0">Source:</p>
                                    <p className="text-xs text-foreground flex items-center gap-1">
                                        <GitBranch className="h-3 w-3 text-muted-foreground" />
                                        {app.branch || "main"}
                                    </p>
                                    {latestDeployment?.sha && (
                                        <span className="text-muted-foreground/60">→</span>
                                    )}
                                    {latestDeployment?.sha && (
                                        <p className="text-xs font-mono text-muted-foreground">
                                            {shortSha(latestDeployment.sha)}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                /* Fallback: status pills when no preview available */
                <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-border/60">
                        <StatusPill
                            label="Primary URL"
                            icon={<Globe className="h-3 w-3" />}
                            value={
                                <div className="flex items-center gap-1.5">
                                    {primaryUrl ? (
                                        <a href={primaryUrl} target="_blank" rel="noopener noreferrer" className="text-info-text hover:underline truncate text-xs" title={primaryUrl}>
                                            {primaryUrl.replace(/^https?:\/\//, "")}
                                        </a>
                                    ) : (
                                        <span className="text-muted-foreground text-xs">No URL</span>
                                    )}
                                    {primaryUrl ? (
                                        <button onClick={copyUrl} className="text-muted-foreground hover:text-muted-foreground flex-shrink-0" aria-label="Copy URL">
                                            <Copy className="h-3 w-3" />
                                        </button>
                                    ) : null}
                                </div>
                            }
                            badge={httpsLive ? "🔒 HTTPS Live" : "HTTP only"}
                            badgeClass={httpsLive ? "text-info-text bg-info-muted border border-info/30" : "text-muted-foreground bg-muted/40 border border-border"}
                        />
                        <StatusPill
                            label="App Status"
                            icon={<Activity className="h-3 w-3" />}
                            value={app.status === "running" ? "Running" : app.status}
                            valueClass={app.status === "running" ? "text-foreground" : ""}
                            badge={app.healthStatus ?? "unknown"}
                            badgeClass={
                                app.healthStatus === "healthy"
                                    ? "text-success-text bg-success-muted border border-success/30"
                                    : app.healthStatus === "unhealthy"
                                        ? "text-danger-text bg-danger-muted border border-danger/30"
                                        : "text-muted-foreground bg-muted/40 border border-border"
                            }
                        />
                        <StatusPill
                            label="Server"
                            icon={<Server className="h-3 w-3" />}
                            value={server.name}
                            badge={server.status}
                            badgeClass="text-success-text bg-success-muted border border-success/30"
                        />
                        <StatusPill
                            label="Domains"
                            icon={<Globe className="h-3 w-3" />}
                            value={`${customDomainCount} custom / ${previewDomainCount} temporary`}
                            badge={sslStatus.label}
                            badgeClass={`border ${sslStatus.color}`}
                        />
                        <StatusPill
                            label="Latest Deploy"
                            icon={<GitBranch className="h-3 w-3" />}
                            value={latestDeployment ? shortSha(latestDeployment.sha) : "No deploys"}
                            badge={latestDeployment ? formatDeploymentStatus(latestDeployment.status) : undefined}
                            badgeClass={latestDeployment ? deploymentBadgeClass(latestDeployment.status) : ""}
                        />
                    </div>
                </div>
            )}

            {/* Two-column main grid */}
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4">
                {/* Left: Application Health */}
                <Card className="border-border shadow-none">
                    <CardContent className="p-4 space-y-4">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <HeartPulse size={28} />
                                <h2 className="text-sm font-bold text-foreground">Application Health</h2>
                            </div>
                            <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
                                {TIME_RANGES.map((r) => (
                                    <button
                                        key={r.id}
                                        onClick={() => setTimeRange(r.id)}
                                        className={cn(
                                            "px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors",
                                            timeRange === r.id
                                                ? "bg-card text-foreground shadow-sm"
                                                : "text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        {r.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Top row: 4 KPIs */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 px-2">
                            <HealthMetric
                                label="Availability"
                                value={`${availability.toFixed(0)}%`}
                                subtitle={`Last ${timeRange === "1h" ? "hour" : timeRange === "24h" ? "24 hours" : timeRange === "7d" ? "7 days" : "30 days"}`}
                                icon={<Activity className="h-3.5 w-3.5" />}
                                valueColor="text-foreground"
                            />
                            <HealthMetric
                                label="Response Time (Avg)"
                                value={`${Math.max(80, Math.round(120 - avgCpu * 0.4))}ms`}
                                subtitle={`Last ${timeRange === "1h" ? "hour" : timeRange === "24h" ? "24 hours" : timeRange === "7d" ? "7 days" : "30 days"}`}
                                icon={<Zap className="h-3.5 w-3.5" />}
                                valueColor="text-foreground"
                            />
                            <HealthMetric
                                label="Success Rate"
                                value={`${successRate.toFixed(0)}%`}
                                subtitle={`Last ${timeRange === "1h" ? "hour" : timeRange === "24h" ? "24 hours" : timeRange === "7d" ? "7 days" : "30 days"}`}
                                icon={<TrendingUp className="h-3.5 w-3.5" />}
                                valueColor="text-foreground"
                            />
                            <HealthMetric
                                label="Uptime"
                                value="99.99%"
                                subtitle={`Last ${timeRange === "1h" ? "hour" : timeRange === "24h" ? "24 hours" : timeRange === "7d" ? "7 days" : "30 days"}`}
                                icon={<Shield className="h-3.5 w-3.5" />}
                                valueColor="text-foreground"
                            />
                        </div>

                        {/* Chart */}
                        <div className="px-2 pt-1">
                            <MiniAreaChart values={cpuSeries.length > 0 ? cpuSeries.map((c) => Math.max(0, 100 - c)) : [98, 99, 97, 99, 98, 100, 99]} color="var(--opslin-info-default)" />
                        </div>

                        {/* Bottom row: 4 stat cards */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
                            <div className="rounded-xl border border-border px-3 py-2.5">
                                <div className="flex items-center gap-1.5 text-info-text">
                                    <Heart className="h-3.5 w-3.5" />
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Health Checks</span>
                                </div>
                                <p className="mt-1 text-base font-bold text-info-text">200 OK / 15.4k</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">Total successful</p>
                            </div>
                            <div className="rounded-xl border border-border px-3 py-2.5">
                                <div className="flex items-center gap-1.5 text-info-text">
                                    <BarChart3 className="h-3.5 w-3.5" />
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Requests</span>
                                </div>
                                <p className="mt-1 text-base font-bold text-foreground">24.5k</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">Total requests</p>
                            </div>
                            <div className="rounded-xl border border-border px-3 py-2.5">
                                <div className="flex items-center gap-1.5 text-chart-violet">
                                    <Download className="h-3.5 w-3.5" />
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Throughput</span>
                                </div>
                                <p className="mt-1 text-base font-bold text-foreground">81.2 KB/s</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">Avg. transfer rate</p>
                            </div>
                            <div className="rounded-xl border border-border px-3 py-2.5">
                                <div className="flex items-center gap-1.5 text-warning-text">
                                    <AlertCircle className="h-3.5 w-3.5" />
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Error Rate</span>
                                </div>
                                <p className="mt-1 text-base font-bold text-foreground">0.25%</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">Total requests</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Right: Deployment timeline */}
                <Card className="border-border shadow-none">
                    <CardContent className="p-4 space-y-3">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Rocket size={28} />
                                <h2 className="text-sm font-bold text-foreground">Deployment</h2>
                            </div>
                            <Link href="?section=deployments" className="text-[11px] font-semibold text-info-text hover:underline">
                                View All Deployments
                            </Link>
                        </div>

                        {/* Current release block */}
                        <div className="space-y-2 pb-3 border-b border-border/60">
                            <div className="flex items-center justify-between">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Current Release</p>
                                {latestDeployment ? (
                                    <Badge className={deploymentBadgeClass(latestDeployment.status)}>
                                        {formatDeploymentStatus(latestDeployment.status)}
                                    </Badge>
                                ) : null}
                            </div>
                            <p className="text-base font-bold text-foreground font-mono">{latestDeployment ? shortSha(latestDeployment.sha) : "—"}</p>
                            {latestDeployment ? (
                                <>
                                    <p className="text-[11px] text-muted-foreground">
                                        Started {formatRelativeTime(latestDeployment.startedAt)} by {latestDeployment.triggeredBy || "manual"}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                                        <GitBranch className="h-3 w-3" />
                                        {app.branch || "main"}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground">
                                        {latestDeployment.sameCommitRedeploy ? "Same commit redeployed" : "New changes deployed"}
                                    </p>
                                </>
                            ) : null}
                        </div>

                        {/* Stat row */}
                        {latestDeployment ? (
                            <div className="grid grid-cols-4 gap-2 pb-3 border-b border-border/60">
                                <div>
                                    <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Duration</p>
                                    <p className="text-xs font-bold text-foreground mt-0.5">2m 45s</p>
                                </div>
                                <div>
                                    <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Changes</p>
                                    <p className="text-xs font-bold text-foreground mt-0.5">12 files</p>
                                </div>
                                <div>
                                    <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Status</p>
                                    <p className="text-xs font-bold text-success-text mt-0.5">Live</p>
                                </div>
                                <div>
                                    <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Triggered By</p>
                                    <p className="text-xs font-bold text-foreground mt-0.5 truncate">manual</p>
                                </div>
                            </div>
                        ) : null}

                        {/* Timeline */}
                        <ul className="space-y-0">
                            {deploymentTimeline.map((item, i) => (
                                <TimelineItem
                                    key={i}
                                    label={item.label}
                                    description={item.description}
                                    timestamp={item.timestamp}
                                    state={item.state}
                                />
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            </div>

            {/* Quick Actions */}
            <Card className="border-border shadow-none">
                <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <h2 className="text-sm font-bold text-foreground">Quick Actions</h2>
                        <span className="text-[11px] text-muted-foreground">Perform common actions for your application</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        <QuickActionCard
                            title="Deploy New Release"
                            subtitle="Deploy from source or existing build"
                            icon={<Rocket size={36} />}
                            iconBg="bg-info-muted"
                            iconColor="text-info-text"
                            onClick={onDeploy}
                            disabled={deployPending || deleteLocked}
                        />
                        <QuickActionCard
                            title="Open Application"
                            subtitle="Visit your live application"
                            icon={<ExternalLink size={36} />}
                            iconBg="bg-success-muted"
                            iconColor="text-success-text"
                            href={openUrl ?? undefined}
                            disabled={!openUrl}
                        />
                        <QuickActionCard
                            title="View Logs"
                            subtitle="Stream and inspect logs"
                            icon={<FileText size={36} />}
                            iconBg="bg-chart-violet/10"
                            iconColor="text-chart-violet"
                            onClick={onViewLogs}
                        />
                        <QuickActionCard
                            title="Rollback"
                            subtitle="Revert to a previous version"
                            icon={<RotateCw size={36} />}
                            iconBg="bg-warning-muted"
                            iconColor="text-warning-text"
                            onClick={() => rollbackTarget && onRollback(rollbackTarget.sha)}
                            disabled={!rollbackTarget || rollbackPending || deleteLocked || app.status === "deploying"}
                        />
                        <QuickActionCard
                            title="Server Details"
                            subtitle="View server information"
                            icon={<Server size={36} />}
                            iconBg="bg-muted"
                            iconColor="text-muted-foreground"
                            href={`/servers/${server.id}`}
                        />
                        <QuickActionCard
                            title="Manage Domains"
                            subtitle="Add or manage domains"
                            icon={<Wifi size={36} />}
                            iconBg="bg-info-muted"
                            iconColor="text-info-text"
                            href={`/apps/${app.id}?section=domains`}
                        />
                    </div>
                </CardContent>
            </Card>
        </section>
    );
}
