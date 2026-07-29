"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowUpRight, RotateCcw, Rocket, ChevronDown, MoreVertical, ExternalLink, FileText, ArrowRight, FileCode, FlaskConical, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { api, type DeploymentRecord } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";
import { LivePulse } from "@/components/patterns/live-pulse";

type DeploymentItem = DeploymentRecord & { appId: string; appName: string; serverName: string; serverIp: string };

function MiniSparkline({ data, color, width = 60, height = 24 }: { data: number[]; color: string; width?: number; height?: number }) {
    if (!data || data.length < 2) return <div style={{ width, height }} />;
    const max = Math.max(...data, 1);
    const points = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - (v / max) * (height - 4) - 2}`).join(" ");
    return (
        <svg width={width} height={height} className="inline-block">
            <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function SuccessRing({ percent, size = 52 }: { percent: number; size?: number }) {
    const r = (size - 8) / 2;
    const circ = 2 * Math.PI * r;
    const offset = circ - (percent / 100) * circ;
    return (
        <svg width={size} height={size} className="inline-block">
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth="5" />
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--opslin-success-default)" strokeWidth="5" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        </svg>
    );
}

export default function DeploymentsPage() {
    const [visibleCount, setVisibleCount] = useState(10);

    const { data: apps = [], isLoading } = useQuery({
        queryKey: ["deployments", "apps"],
        queryFn: () => api.getAllApps(),
    });

    const { data: deployments = [] } = useQuery({
        queryKey: ["deployments", "all", apps.map(a => a.id)],
        enabled: apps.length > 0,
        queryFn: async () => {
            const records = await Promise.all(
                apps.map(async (app) => {
                    try {
                        const items = await api.getAppDeployments(app.id);
                        return items.map(d => ({ ...d, appId: app.id, appName: app.name, serverName: app.server.name, serverIp: app.server.ip || "" }));
                    } catch { return [] as DeploymentItem[]; }
                })
            );
            return records.flat().sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()).slice(0, 50);
        },
    });

    const recentCount = deployments.length;
    const runningCount = deployments.filter(d => d.status === "running").length;
    const failedCount = deployments.filter(d => d.status === "failed").length;
    const succeededCount = deployments.filter(d => d.status === "succeeded").length;
    const successRate = recentCount > 0 ? ((succeededCount / recentCount) * 100) : 0;

    const recentSparkline = useMemo(() => {
        const buckets = Array(7).fill(0);
        const now = Date.now();
        deployments.forEach(d => {
            const daysAgo = Math.floor((now - new Date(d.startedAt).getTime()) / 86400000);
            if (daysAgo < 7) buckets[6 - daysAgo]++;
        });
        return buckets;
    }, [deployments]);

    const failedSparkline = useMemo(() => {
        const buckets = Array(7).fill(0);
        const now = Date.now();
        deployments.filter(d => d.status === "failed").forEach(d => {
            const daysAgo = Math.floor((now - new Date(d.startedAt).getTime()) / 86400000);
            if (daysAgo < 7) buckets[6 - daysAgo]++;
        });
        return buckets;
    }, [deployments]);

    const visibleDeployments = deployments.slice(0, visibleCount);

    return (
        <div className="dashboard-page">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <Rocket size={36} />
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Deployments</h1>
                        <p className="text-sm text-muted-foreground">Track active releases, rollback history, and recent deployment outcomes across every app.</p>
                    </div>
                </div>
                <Button size="sm" className="h-9 gap-2 text-sm font-medium px-4" asChild>
                    <Link href="/apps/new">
                        <Rocket className="h-4 w-4" /> Deploy new
                        <ChevronDown className="h-3.5 w-3.5 ml-1" />
                    </Link>
                </Button>
            </div>

            {/* Stats Cards - with solid visible borders */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="rounded-xl border border-border bg-card p-5">
                    <div className="text-xs text-muted-foreground mb-2">Recent deployments</div>
                    <div className="flex items-end justify-between">
                        <span className="text-4xl font-mono font-bold text-foreground">{recentCount}</span>
                        <MiniSparkline data={recentSparkline} color="var(--opslin-info-default)" width={70} height={28} />
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-2">Last 7 days</div>
                </div>
                <div className="rounded-xl border border-border bg-card p-5">
                    <div className="text-xs text-muted-foreground mb-2">Running now</div>
                    <div className="flex items-end justify-between">
                        <span className="text-4xl font-mono font-bold text-foreground">{runningCount}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-2">{runningCount > 0 ? `${runningCount} active now` : "No active deployments"}</div>
                </div>
                <div className="rounded-xl border border-border bg-card p-5">
                    <div className="text-xs text-muted-foreground mb-2">Failed recently</div>
                    <div className="flex items-end justify-between">
                        <span className="text-4xl font-mono font-bold text-foreground">{failedCount}</span>
                        <MiniSparkline data={failedSparkline} color="var(--opslin-danger-default)" width={70} height={28} />
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-2">Last 7 days</div>
                </div>
                <div className="rounded-xl border border-border bg-card p-5">
                    <div className="text-xs text-muted-foreground mb-2">Success rate</div>
                    <div className="flex items-end justify-between">
                        <span className="text-4xl font-mono font-bold text-foreground">{successRate.toFixed(1)}%</span>
                        <SuccessRing percent={successRate} size={48} />
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-2">Last 30 days</div>
                </div>
            </div>

            {/* Release Timeline - with solid border */}
            <div className="rounded-xl border border-border bg-card">
                <div className="px-6 pt-6 pb-4">
                    <h2 className="text-lg font-semibold text-foreground">Release timeline</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">Latest deployments across all applications.</p>
                </div>

                {isLoading ? (
                    <div className="px-6 pb-6 py-8 text-center text-sm text-muted-foreground">Loading deployments…</div>
                ) : deployments.length === 0 ? (
                    <div className="px-6 pb-6">
                        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No deployments recorded yet.</div>
                    </div>
                ) : (
                    <div className="px-4 pb-4">
                        {visibleDeployments.map((d) => {
                            const isSuccess = d.status === "succeeded";
                            const isFailed = d.status === "failed";
                            const isRunning = d.status === "running" || d.status === "pending";
                            // RUNNING/PENDING rows link straight into the Deployments tab, where
                            // DeploymentsSection mounts the real DeployLiveView inline for the
                            // truth deployment (doc 03 Group B) — same real event source as the
                            // apps/[id] overlay, not a second progress UI.
                            const appLink = isRunning ? `/apps/${d.appId}?section=deployments` : `/apps/${d.appId}`;
                            const duration = d.finishedAt ? (() => {
                                const diff = new Date(d.finishedAt).getTime() - new Date(d.startedAt).getTime();
                                const secs = Math.floor(diff / 1000);
                                return secs >= 60 ? `${Math.floor(secs / 60)}m ${String(secs % 60).padStart(2, "0")}s` : `${secs}s`;
                            })() : "—";
                            const finishedAgo = d.finishedAt ? formatRelativeTime(d.finishedAt) : (d.status === "running" ? "in progress" : "—");

                            return (
                                <div key={d.id} className="flex items-center gap-4 border-b border-border/50 last:border-b-0 px-2 py-4">
                                    {/* Status indicator */}
                                    <div className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${isSuccess ? "bg-success-muted" : isFailed ? "bg-danger-muted" : "bg-info-muted"}`}>
                                        <span className={`h-3 w-3 rounded-full ${isSuccess ? "bg-success" : isFailed ? "bg-danger" : "bg-info"}`} />
                                    </div>

                                    {/* App info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2.5 flex-wrap">
                                            <Link href={appLink} className="text-sm font-semibold text-foreground hover:text-brand transition-colors">{d.appName}</Link>
                                            <span className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${isSuccess ? "bg-success-muted text-success" : isFailed ? "bg-danger-muted text-danger" : "bg-info-muted text-info"}`}>
                                                {isRunning ? <LivePulse label="Deployment in progress" /> : null}
                                                {d.status === "succeeded" ? "SUCCESS" : d.status === "failed" ? "FAILED" : d.status.toUpperCase()}
                                            </span>
                                            <span className="text-xs font-mono text-muted-foreground">{d.sha.slice(0, 7)}</span>
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
                                            <span>ip-{d.serverIp ? d.serverIp.replace(/\./g, "-") : "unknown"}</span>
                                            <span>•</span>
                                            <span>{duration}</span>
                                            <span>•</span>
                                            <span>{isFailed ? "failed" : "finished"} {finishedAgo}</span>
                                        </div>
                                    </div>

                                    {/* Actions - ALWAYS visible like reference */}
                                    <div className="flex items-center gap-2 shrink-0">
                                        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 border-border" asChild>
                                            <Link href={appLink}>
                                                {isFailed ? <><FileText className="h-3.5 w-3.5" /> Open logs</> : <><ArrowUpRight className="h-3.5 w-3.5" /> Open app</>}
                                            </Link>
                                        </Button>
                                        {["succeeded", "rolled_back"].includes(d.status) && (
                                            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 border-border" asChild>
                                                <Link href={`/apps/${d.appId}?section=deployments`}><RotateCcw className="h-3.5 w-3.5" /> Rollback</Link>
                                            </Button>
                                        )}
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0"><MoreVertical className="h-4 w-4" /></Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem asChild><Link href={`/apps/${d.appId}`}>View app details</Link></DropdownMenuItem>
                                                <DropdownMenuItem asChild><Link href={`/apps/${d.appId}?section=deployments`}>Deployment history</Link></DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Load more */}
                {deployments.length > visibleCount && (
                    <div className="flex justify-center border-t border-border/50 py-4">
                        <Button variant="outline" size="sm" className="h-9 text-sm gap-2 border-border px-5" onClick={() => setVisibleCount(v => v + 10)}>
                            Load more deployments <ChevronDown className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                )}
            </div>

            {/* Understanding deployments - with solid border */}
            <div className="rounded-xl border border-border bg-card p-6">
                <h3 className="text-lg font-semibold text-foreground mb-1">Understanding deployments</h3>
                <p className="text-sm text-muted-foreground mb-6">Every deployment goes through a safe and automated process.</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                    {[
                        { icon: FileCode, title: "1. Code pushed", desc: "You push code to repository" },
                        { icon: FlaskConical, title: "2. Build & test", desc: "We build and test your code" },
                        { icon: Rocket, title: "3. Deploy", desc: "Your app is deployed to server" },
                        { icon: CheckCircle2, title: "4. Live & monitored", desc: "We monitor health & performance" },
                    ].map((step, i) => (
                        <div key={step.title} className="flex items-start gap-3">
                            <step.icon size={32} />
                            <div className="flex-1">
                                <div className="text-sm font-medium text-foreground">{step.title}</div>
                                <div className="text-xs text-muted-foreground mt-0.5">{step.desc}</div>
                            </div>
                            {i < 3 && <ArrowRight className="h-4 w-4 text-muted-foreground/50 mt-2 hidden sm:block" />}
                        </div>
                    ))}
                </div>
                <div className="mt-6 pt-4 border-t border-border flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Need help? View our <a href="#" className="text-brand hover:text-brand-hover font-medium">deployment guide <ExternalLink className="h-3 w-3 inline" /></a></span>
                    <a href="#" className="text-sm text-brand hover:text-brand-hover font-medium flex items-center gap-1">View all documentation <ExternalLink className="h-3 w-3" /></a>
                </div>
            </div>
        </div>
    );
}
