"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
    ArrowUpRight, ExternalLink, Share2, Shield, TrendingUp, CheckCircle2, ShieldAlert,
    BarChart3, CircleAlert, CircleHelp, Headset, LineChart, Clock, HeartPulse, Bell, Lock, Puzzle, Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { api } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// Uptime bar visualization - shows health status over time as colored blocks
function UptimeBar({ percent, status }: { percent: number; status: string }) {
    const blocks = 40;
    const healthyBlocks = Math.round((percent / 100) * blocks);
    return (
        <div className="flex items-center gap-[1px]">
            {Array.from({ length: blocks }, (_, i) => {
                const isHealthy = i < healthyBlocks;
                const isDegraded = !isHealthy && i < healthyBlocks + 2;
                return (
                    <div
                        key={i}
                        className={`h-5 w-[3px] rounded-[1px] ${
                            status === "UNHEALTHY" && i >= healthyBlocks ? "bg-danger" :
                            isDegraded ? "bg-warning" :
                            isHealthy ? "bg-success" : "bg-danger"
                        }`}
                    />
                );
            })}
        </div>
    );
}

export default function TransparencyPage() {
    const { data, isLoading } = useQuery({
        queryKey: ["organization", "sla"],
        queryFn: () => api.getOrganizationSlaOverview(),
    });

    const { data: events = [] } = useQuery({
        queryKey: ["alert-events-transparency"],
        queryFn: () => api.getAlertEvents("all"),
    });

    const firingEvents = useMemo(() => events.filter(e => e.status === "firing"), [events]);
    const recentIncidents = useMemo(() => events.slice(0, 5), [events]);

    const uptimeValue = data?.uptimePercent7d || 0;
    const targetPercent = data?.targetPercent || 99.9;
    const meetsTarget = uptimeValue >= targetPercent;

    return (
        <div className="dashboard-page">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <Shield size={36} />
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Transparency</h1>
                        <p className="text-sm text-muted-foreground">Real-time visibility into system health, uptime, and incident context across your organization.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="h-9 gap-2 border-border text-sm">
                        <Share2 className="h-4 w-4" /> Share status page
                    </Button>
                    <Button size="sm" className="h-9 gap-2 text-sm" asChild>
                        <a href={`${API_BASE}/status/${data?.organizationSlug || ""}`} target="_blank" rel="noreferrer">
                            View status page <ArrowUpRight className="h-3.5 w-3.5" />
                        </a>
                    </Button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="rounded-xl border border-border bg-card p-5">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-muted-foreground">7-Day Uptime</span>
                        <TrendingUp size={20} />
                    </div>
                    <div className="text-3xl font-mono font-bold text-foreground">{isLoading ? "…" : `${uptimeValue.toFixed(2)}%`}</div>
                    <div className={`text-[11px] font-medium mt-1 ${meetsTarget ? "text-success" : "text-danger"}`}>{meetsTarget ? "Meeting target" : "Below target"}</div>
                    <div className="text-[10px] text-muted-foreground">Rolling 7-day window</div>
                </div>
                <div className="rounded-xl border border-border bg-card p-5">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-muted-foreground">Uptime Target</span>
                        <CheckCircle2 size={20} />
                    </div>
                    <div className="text-3xl font-mono font-bold text-foreground">{isLoading ? "…" : `${targetPercent.toFixed(1)}%`}</div>
                    <div className="text-[11px] text-muted-foreground mt-1">7-day rolling target</div>
                    <div className={`text-[10px] font-medium mt-0.5 ${meetsTarget ? "text-success" : "text-danger"}`}>{meetsTarget ? "You are meeting the target" : "You are below the target"}</div>
                </div>
                <div className="rounded-xl border border-border bg-card p-5">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-muted-foreground">Apps At Risk</span>
                        <ShieldAlert size={20} />
                    </div>
                    <div className="text-3xl font-mono font-bold text-foreground">{isLoading ? "…" : String(data?.appsAtRisk || 0)}</div>
                    <div className="text-[11px] text-muted-foreground mt-1">Below 7-day threshold</div>
                    {(data?.appsAtRisk || 0) > 0 && (
                        <a href="#apps" className="text-[10px] text-info-text font-medium mt-0.5 inline-flex items-center gap-0.5">View affected apps <ArrowUpRight className="h-2.5 w-2.5" /></a>
                    )}
                </div>
                <div className="rounded-xl border border-border bg-card p-5">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-muted-foreground">Health Samples</span>
                        <BarChart3 size={20} />
                    </div>
                    <div className="text-3xl font-mono font-bold text-foreground">{isLoading ? "…" : (data?.totalSamples7d || 0).toLocaleString()}</div>
                    <div className="text-[11px] text-muted-foreground mt-1">Collected in current window.</div>
                </div>
            </div>

            {/* App Uptime Overview */}
            <div id="apps" className="rounded-xl border border-border bg-card">
                <div className="px-6 pt-6 pb-4 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-foreground">App Uptime Overview</h2>
                        <p className="text-sm text-muted-foreground mt-0.5">Live status of your applications compared to the 7-day rolling window.</p>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-success" /> Healthy</span>
                        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-warning" /> Degraded</span>
                        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-danger" /> Down</span>
                        <Select defaultValue="7d">
                            <SelectTrigger className="h-7 w-28 border-border bg-background text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="7d">Last 7 days</SelectItem>
                                <SelectItem value="30d">Last 30 days</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="px-4 pb-4">
                    {isLoading ? (
                        <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
                    ) : data && data.apps.length > 0 ? (
                        <div className="space-y-0">
                            {data.apps.map(app => (
                                <div key={app.appId} className="flex items-center gap-4 border-b border-border/50 last:border-b-0 px-2 py-4">
                                    <div className="w-40 shrink-0">
                                        <div className="text-sm font-medium text-foreground">{app.appName}</div>
                                        {app.domain ? <div className="text-[10px] text-muted-foreground truncate">{app.domain}</div> : null}
                                    </div>
                                    <StatusBadge status={app.currentHealthStatus} className="shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <UptimeBar percent={app.uptimePercent7d} status={app.currentHealthStatus} />
                                    </div>
                                    <div className="text-right shrink-0 w-20">
                                        <div className="text-sm font-mono font-bold text-foreground">{app.uptimePercent7d.toFixed(2)}%</div>
                                        <div className="text-[10px] text-muted-foreground">Uptime</div>
                                    </div>
                                    <Link href={`/apps/${app.appId}`} className="text-xs text-info-text hover:text-info/80 font-medium flex items-center gap-1 shrink-0">
                                        Open app <ArrowUpRight className="h-3 w-3" />
                                    </Link>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="py-8 text-center text-sm text-muted-foreground">No apps available yet.</div>
                    )}
                </div>

                {data && data.apps.length > 0 && (
                    <div className="border-t border-border px-6 py-3 flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Showing 1 to {data.apps.length} of {data.apps.length} apps</span>
                        <Link href="/apps" className="text-xs text-info-text hover:text-info/80 font-medium flex items-center gap-1">View all apps <ArrowUpRight className="h-3 w-3" /></Link>
                    </div>
                )}
            </div>

            {/* Current Incidents */}
            <div className="rounded-xl border border-border bg-card p-6">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <h2 className="text-lg font-semibold text-foreground">Current Incidents</h2>
                        {firingEvents.length > 0 && (
                            <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-danger text-danger-foreground text-[10px] font-bold">{firingEvents.length}</span>
                        )}
                    </div>
                    <Link href="/alerts" className="text-xs text-info-text hover:text-info/80 font-medium flex items-center gap-1">View all incidents <ArrowUpRight className="h-3 w-3" /></Link>
                </div>
                <p className="text-sm text-muted-foreground mb-4">Active issues that may impact your applications.</p>

                {firingEvents.length === 0 ? (
                    <div className="flex items-center gap-3 rounded-lg bg-success-muted border border-success/30 p-4">
                        <CheckCircle2 size={28} />
                        <div>
                            <div className="text-sm font-medium text-success-text">All systems operational</div>
                            <div className="text-xs text-success-text">No active incidents at this time.</div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {firingEvents.map(event => (
                            <div key={event.id} className="flex items-center justify-between rounded-lg border border-danger/30 bg-danger-muted p-4">
                                <div className="flex items-center gap-3">
                                    <CircleAlert size={24} />
                                    <div>
                                        <div className="text-sm font-medium text-foreground">{event.rule?.metricLabel || "Alert"} on {event.rule?.app?.name || event.rule?.server?.name || "service"}</div>
                                        <div className="text-xs text-muted-foreground">Started {new Date(event.openedAt).toLocaleString()}</div>
                                    </div>
                                    {event.rule?.severity ? <StatusBadge status={event.rule.severity} /> : null}
                                </div>
                                <Link href={`/alerts/${event.id}`} className="text-xs text-info-text hover:text-info/80 font-medium">Incident details</Link>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* What is Transparency? */}
            <div className="rounded-xl border border-border bg-card p-6">
                <h2 className="text-lg font-semibold text-foreground mb-1">What is Transparency?</h2>
                <p className="text-sm text-muted-foreground mb-6">Transparency gives you clear visibility into the health and reliability of your applications and infrastructure.</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
                    {[
                        { icon: LineChart, title: "Real-time monitoring", desc: "We continuously monitor your apps and infrastructure 24/7." },
                        { icon: Clock, title: "Rolling 7-day window", desc: "Uptime and performance are calculated on a rolling 7-day basis." },
                        { icon: HeartPulse, title: "Health samples", desc: "We collect thousands of health samples to ensure accuracy." },
                        { icon: Bell, title: "Incident visibility", desc: "You'll be notified and can track incidents in real-time." },
                    ].map(item => (
                        <div key={item.title}>
                            <item.icon size={28} className="mb-2" />
                            <div className="text-sm font-medium text-foreground">{item.title}</div>
                            <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.desc}</div>
                        </div>
                    ))}
                </div>
                <div className="mt-6 pt-4 border-t border-border flex items-center gap-4">
                    <span className="text-sm text-muted-foreground">Learn more about how transparency works in our documentation.</span>
                    <a href="#" className="text-sm text-info-text hover:text-info/80 font-medium flex items-center gap-1">Read documentation <ExternalLink className="h-3 w-3" /></a>
                </div>
            </div>

            {/* FIS methodology disclosure (docs/audit/07_FIS_DESIGN.md) */}
            <div id="fis-methodology" className="rounded-xl border border-border bg-card p-6 scroll-mt-20">
                <h2 className="text-lg font-semibold text-foreground mb-1">Failure-Pattern Sharing (FIS)</h2>
                <p className="text-sm text-muted-foreground mb-6">
                    Opslin&apos;s Fleet Immune System runs preflight checks before every deploy and, only if you opt
                    in, learns from fleet-wide failure patterns — without ever seeing your secrets, hostnames, or raw
                    data.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
                    {[
                        { icon: Shield, title: "Org-local by default", desc: "Every preflight check and failure record stays scoped to your organization unless you explicitly opt in to fleet sharing." },
                        { icon: Lock, title: "Bucketed, not raw", desc: "Shared data is reduced to coarse buckets (RAM range, OS family, days since last success) — never secret values, hostnames, or file contents." },
                        { icon: Puzzle, title: "k-anonymous (k≥5)", desc: "A failure pattern only becomes visible fleet-wide once at least 5 different organizations report the same bucketed pattern." },
                        { icon: Settings, title: "Your control", desc: "Turn fleet-pattern sharing on or off anytime from Settings. Preflight checks and risk scores keep working either way." },
                    ].map(item => (
                        <div key={item.title}>
                            <item.icon size={28} className="mb-2" />
                            <div className="text-sm font-medium text-foreground">{item.title}</div>
                            <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.desc}</div>
                        </div>
                    ))}
                </div>
                <div className="mt-6 pt-4 border-t border-border flex items-center gap-4">
                    <span className="text-sm text-muted-foreground">Manage whether your organization shares anonymized failure patterns.</span>
                    <Link href="/settings" className="text-sm text-info-text hover:text-info/80 font-medium flex items-center gap-1">
                        Open Settings <ArrowUpRight className="h-3 w-3" />
                    </Link>
                </div>
            </div>

            {/* Recent Incident History */}
            <div className="rounded-xl border border-border bg-card">
                <div className="px-6 pt-6 pb-4 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-foreground">Recent Incident History</h2>
                        <p className="text-sm text-muted-foreground mt-0.5">A timeline of recent incidents across your organization.</p>
                    </div>
                    <Select defaultValue="30d">
                        <SelectTrigger className="h-8 w-32 border-border bg-background text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="7d">Last 7 days</SelectItem>
                            <SelectItem value="30d">Last 30 days</SelectItem>
                            <SelectItem value="90d">Last 90 days</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-y border-border bg-muted/30">
                                <th className="text-left py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Incident</th>
                                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Impact</th>
                                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Started</th>
                                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Duration</th>
                            </tr>
                        </thead>
                        <tbody>
                            {recentIncidents.length > 0 ? recentIncidents.map(event => {
                                const isResolved = event.status === "resolved";
                                const isFiring = event.status === "firing";
                                const duration = event.resolvedAt
                                    ? (() => { const d = new Date(event.resolvedAt).getTime() - new Date(event.openedAt).getTime(); const h = Math.floor(d / 3600000); const m = Math.floor((d % 3600000) / 60000); return h > 0 ? `${h}h ${m}m` : `${m}m`; })()
                                    : "Ongoing";

                                return (
                                    <tr key={event.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                                        <td className="py-3.5 px-6">
                                            <div className={`h-6 w-6 rounded-full flex items-center justify-center ${isResolved ? "bg-success-muted" : isFiring ? "bg-danger-muted" : "bg-warning-muted"}`}>
                                                <span className={`h-3 w-3 rounded-full ${isResolved ? "bg-success" : isFiring ? "bg-danger" : "bg-warning"}`} />
                                            </div>
                                        </td>
                                        <td className="py-3.5 px-4">
                                            <div className="text-sm font-medium text-foreground">{event.rule?.metricLabel || "Alert"} on {event.rule?.app?.name || event.rule?.server?.name || "service"}</div>
                                            <div className="text-[10px] text-muted-foreground">{isResolved ? "Incident resolved" : isFiring ? "Incident active" : "Incident silenced"}</div>
                                        </td>
                                        <td className="py-3.5 px-4">
                                            {event.rule?.severity ? <StatusBadge status={event.rule.severity} /> : null}
                                        </td>
                                        <td className="py-3.5 px-4 text-xs text-muted-foreground">{new Date(event.openedAt).toLocaleString()}</td>
                                        <td className="py-3.5 px-4 text-xs text-muted-foreground">{duration}</td>
                                    </tr>
                                );
                            }) : (
                                <tr><td colSpan={5} className="py-8 text-center text-sm text-muted-foreground">No incidents recorded in this period.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {recentIncidents.length > 0 && (
                    <div className="border-t border-border px-6 py-3 flex items-center justify-center">
                        <Link href="/alerts" className="text-xs text-info-text hover:text-info/80 font-medium flex items-center gap-1">View all incidents <ArrowUpRight className="h-3 w-3" /></Link>
                    </div>
                )}
            </div>

            {/* Help footer */}
            <div className="rounded-xl border border-border bg-card p-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <CircleHelp size={28} />
                    <div>
                        <div className="text-sm font-medium text-foreground">Have questions about system status?</div>
                        <div className="text-xs text-muted-foreground">Our team is here to help you understand any incidents or metrics</div>
                    </div>
                </div>
                <a href="#" className="text-sm text-info-text hover:text-info/80 font-medium flex items-center gap-1">
                    Contact support <Headset size={16} />
                </a>
            </div>
        </div>
    );
}
