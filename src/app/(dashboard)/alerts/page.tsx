"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Plus, Search, Filter, MoreHorizontal, ChevronLeft, ChevronRight, Play, Bell, CircleAlert, ListChecks, BellOff, CheckCircle2, Slack, MessageCircle, Siren, Mail, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
    api,
    type AlertChannelInput,
    type AlertMetric,
    type AlertOperator,
    type AlertSeverity,
    type AlertSilenceDuration,
    type AlertRuleRecord,
    type AlertTimelinePoint,
} from "@/lib/api";

const PAGE_SIZE = 6;
const metricOptions: Array<{ value: AlertMetric; label: string }> = [
    { value: "http_5xx_rate", label: "HTTP 5xx rate" },
    { value: "cpu_percent", label: "CPU percent" },
    { value: "health_status", label: "Health status" },
];
const operatorLabels: Record<string, string> = { GT: "> ", GTE: "≥ ", LT: "< ", LTE: "≤ ", EQ: "= " };
const severityConfig: Record<string, { label: string; bg: string; text: string }> = {
    INFO: { label: "Info", bg: "bg-info-muted", text: "text-info-text" },
    WARN: { label: "Warning", bg: "bg-warning-muted", text: "text-warning-text" },
    CRIT: { label: "Critical", bg: "bg-danger-muted", text: "text-danger-text" },
};
const channelTypeConfig: Record<"slack" | "discord" | "pagerduty" | "email", { label: string; icon: LucideIcon; placeholder: string; available: boolean }> = {
    slack: { label: "Slack", icon: Slack, placeholder: "https://hooks.slack.com/services/...", available: true },
    discord: { label: "Discord", icon: MessageCircle, placeholder: "https://discord.com/api/webhooks/...", available: true },
    pagerduty: { label: "PagerDuty", icon: Siren, placeholder: "PagerDuty routing key", available: true },
    email: { label: "Email", icon: Mail, placeholder: "Email delivery isn't available yet", available: false },
};

// SVG Timeline Chart
function TimelineChart({ data }: { data: AlertTimelinePoint[] }) {
    if (!data || data.length === 0) {
        return (
            <div className="h-[180px] flex flex-col items-center justify-center text-muted-foreground">
                <Search className="h-8 w-8 mb-2 opacity-40" />
                <p className="text-sm font-medium">No alert history yet</p>
                <p className="text-xs">Alert events will appear here once rules start triggering.</p>
            </div>
        );
    }
    const padding = { top: 10, right: 10, bottom: 25, left: 25 };
    const w = 600, h = 160;
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;
    const maxVal = Math.max(...data.map(d => Math.max(d.firing, d.resolved, d.silenced)), 2);
    const getX = (i: number) => padding.left + (i / Math.max(data.length - 1, 1)) * chartW;
    const getY = (v: number) => padding.top + chartH - (v / maxVal) * chartH;

    const firingPath = data.map((d, i) => `${i === 0 ? "M" : "L"} ${getX(i)} ${getY(d.firing)}`).join(" ");
    const resolvedPath = data.map((d, i) => `${i === 0 ? "M" : "L"} ${getX(i)} ${getY(d.resolved)}`).join(" ");
    const silencedPath = data.map((d, i) => `${i === 0 ? "M" : "L"} ${getX(i)} ${getY(d.silenced)}`).join(" ");

    const step = Math.max(1, Math.floor(data.length / 6));
    const xLabels = data.filter((_, i) => i % step === 0 || i === data.length - 1);

    return (
        <div>
            <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="xMidYMid meet">
                {/* Y grid */}
                {[0, 0.5, 1].map(f => (
                    <g key={f}>
                        <line x1={padding.left} x2={padding.left + chartW} y1={getY(f * maxVal)} y2={getY(f * maxVal)} stroke="var(--border)" strokeDasharray="2 2" strokeOpacity="0.4" />
                        <text x={padding.left - 6} y={getY(f * maxVal) + 3} textAnchor="end" fontSize="9" fill="var(--muted-foreground)">{Math.round(f * maxVal)}</text>
                    </g>
                ))}
                {/* X labels */}
                {xLabels.map(d => (
                    <text key={d.date} x={getX(data.indexOf(d))} y={h - 4} textAnchor="middle" fontSize="9" fill="var(--muted-foreground)">
                        {new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </text>
                ))}
                {/* Lines */}
                <path d={firingPath} fill="none" stroke="var(--opslin-danger-default)" strokeWidth="2" strokeLinecap="round" />
                <path d={resolvedPath} fill="none" stroke="var(--opslin-success-default)" strokeWidth="2" strokeLinecap="round" />
                <path d={silencedPath} fill="none" stroke="var(--muted-foreground)" strokeWidth="1.5" strokeDasharray="4 3" strokeLinecap="round" />
            </svg>
            <div className="flex items-center justify-center gap-5 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-danger rounded" />Firing</span>
                <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-success rounded" />Resolved</span>
                <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-muted-foreground rounded border-dashed" />Silenced</span>
            </div>
        </div>
    );
}

export default function AlertsPage() {
    const queryClient = useQueryClient();
    // Form state
    const [appId, setAppId] = useState("");
    const [metric, setMetric] = useState<AlertMetric>("http_5xx_rate");
    const [operator, setOperator] = useState<AlertOperator>("GT");
    const [threshold, setThreshold] = useState("5");
    const [durationSec, setDurationSec] = useState("300");
    const [severity, setSeverity] = useState<AlertSeverity>("INFO");
    const [channelType, setChannelType] = useState<"slack" | "discord" | "pagerduty" | "email">("slack");
    const [channelLabel, setChannelLabel] = useState("Primary channel");
    const [channelSecret, setChannelSecret] = useState("");
    const ChannelIcon = channelTypeConfig[channelType].icon;
    // Table state
    const [searchQuery, setSearchQuery] = useState("");
    const [appFilter, setAppFilter] = useState("all");
    const [severityFilter, setSeverityFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState("all");
    const [currentPage, setCurrentPage] = useState(1);

    // Data fetching
    const { data: apps = [] } = useQuery({ queryKey: ["all-apps"], queryFn: () => api.getAllApps() });
    const { data: rules = [] } = useQuery({ queryKey: ["alert-rules"], queryFn: () => api.getAlertRules() });
    const { data: events = [] } = useQuery({ queryKey: ["alert-events"], queryFn: () => api.getAlertEvents("all"), refetchInterval: 30_000 });
    const { data: timeline = [] } = useQuery({ queryKey: ["alert-timeline"], queryFn: () => api.getAlertTimeline() });

    const firingEvents = useMemo(() => events.filter(e => e.status === "firing"), [events]);
    const silencedCount = useMemo(() => events.filter(e => e.status === "silenced").length, [events]);
    const resolvedCount = useMemo(() => events.filter(e => e.status === "resolved").length, [events]);

    // Filtered rules
    const filteredRules = useMemo(() => {
        return rules.filter(rule => {
            if (searchQuery && !rule.metricLabel.toLowerCase().includes(searchQuery.toLowerCase())) return false;
            if (appFilter !== "all" && rule.app?.id !== appFilter) return false;
            if (severityFilter !== "all" && rule.severity !== severityFilter) return false;
            if (statusFilter !== "all") {
                if (statusFilter === "active" && !rule.enabled) return false;
                if (statusFilter === "silenced" && !rule.silencedUntil) return false;
                if (statusFilter === "disabled" && rule.enabled) return false;
            }
            return true;
        });
    }, [rules, searchQuery, appFilter, severityFilter, statusFilter]);

    const totalPages = Math.ceil(filteredRules.length / PAGE_SIZE);
    const paginatedRules = filteredRules.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    // Mutations
    const createRuleMutation = useMutation({
        mutationFn: async () => {
            const channels: AlertChannelInput[] = [];
            if (channelType === "email") {
                // Simplified for now
            } else if (channelType === "pagerduty" && channelSecret) {
                channels.push({ type: "pagerduty", label: channelLabel, routingKey: channelSecret });
            } else if ((channelType === "slack" || channelType === "discord") && channelSecret) {
                channels.push({ type: channelType, label: channelLabel, webhookUrl: channelSecret });
            }
            return api.createAlertRule({
                appId: appId || undefined,
                metric, operator,
                threshold: Number(threshold) || 0,
                durationSec: Number(durationSec) || 60,
                severity, channels, enabled: true,
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["alert-rules"] });
            queryClient.invalidateQueries({ queryKey: ["alert-events"] });
            setChannelSecret("");
        },
    });

    const silenceMutation = useMutation({
        mutationFn: ({ ruleId, duration }: { ruleId: string; duration: AlertSilenceDuration }) => api.silenceAlertRule(ruleId, duration),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["alert-rules"] }); queryClient.invalidateQueries({ queryKey: ["alert-events"] }); },
    });

    const uniqueApps = useMemo(() => {
        const map = new Map<string, string>();
        rules.forEach(r => { if (r.app) map.set(r.app.id, r.app.name); });
        return Array.from(map.entries());
    }, [rules]);

    return (
        <div className="dashboard-page">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <Bell size={36} />
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Alerts</h1>
                        <p className="text-sm text-muted-foreground">Stay informed about important events in your applications.</p>
                    </div>
                </div>
                <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => createRuleMutation.mutate()} disabled={createRuleMutation.isPending}>
                    <Plus className="h-3.5 w-3.5" /> Create Alert Rule
                </Button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-border/60 bg-card p-4 flex items-center gap-3">
                    <CircleAlert size={28} />
                    <div>
                        <div className="text-2xl font-mono font-bold text-foreground">{firingEvents.length}</div>
                        <div className="text-[11px] text-muted-foreground">Firing now</div>
                        <div className="text-[10px] text-muted-foreground">{firingEvents.length > 0 ? `${firingEvents.length} alerts need attention` : "No active alerts"}</div>
                    </div>
                </div>
                <div className="rounded-xl border border-border/60 bg-card p-4 flex items-center gap-3">
                    <ListChecks size={28} />
                    <div>
                        <div className="text-2xl font-mono font-bold text-foreground">{rules.length}</div>
                        <div className="text-[11px] text-muted-foreground">Configured rules</div>
                        <div className="text-[10px] text-muted-foreground">Across all apps</div>
                    </div>
                </div>
                <div className="rounded-xl border border-border/60 bg-card p-4 flex items-center gap-3">
                    <BellOff size={28} />
                    <div>
                        <div className="text-2xl font-mono font-bold text-foreground">{silencedCount}</div>
                        <div className="text-[11px] text-muted-foreground">Silenced</div>
                        <div className="text-[10px] text-muted-foreground">Temporarily muted</div>
                    </div>
                </div>
                <div className="rounded-xl border border-border/60 bg-card p-4 flex items-center gap-3">
                    <CheckCircle2 size={28} />
                    <div>
                        <div className="text-2xl font-mono font-bold text-foreground">{resolvedCount.toLocaleString()}</div>
                        <div className="text-[11px] text-muted-foreground">Resolved</div>
                        <div className="text-[10px] text-muted-foreground">Recent incident history</div>
                    </div>
                </div>
            </div>

            {/* Firing Now */}
            <div className="rounded-xl border border-border/60 bg-card p-5">
                <h2 className="text-base font-semibold text-foreground mb-1">Firing now</h2>
                <p className="text-xs text-muted-foreground mb-4">Alerts that still need your attention.</p>
                {firingEvents.length === 0 ? (
                    <div className="flex items-center gap-3 rounded-lg bg-success-muted border border-success/30 p-4">
                        <CheckCircle2 size={28} />
                        <div>
                            <div className="text-sm font-medium text-success-text">No firing alerts</div>
                            <div className="text-xs text-success-text">Great! All systems are healthy.</div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {firingEvents.map(event => (
                            <div key={event.id} className="flex items-center justify-between rounded-lg border border-danger/30 bg-danger-muted p-3">
                                <div className="flex items-center gap-3">
                                    <span className="h-2 w-2 rounded-full bg-danger animate-pulse" />
                                    <div>
                                        <span className="text-sm font-medium text-foreground">{event.rule?.metricLabel || "Alert"}</span>
                                        <span className="text-xs text-muted-foreground ml-2">{event.rule?.app?.name || event.rule?.server?.name || ""}</span>
                                    </div>
                                </div>
                                <Link href={`/alerts/${event.id}`} className="text-xs text-info-text hover:text-info/80 font-medium">Drill in →</Link>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Alert Timeline */}
            <div className="rounded-xl border border-border/60 bg-card p-5">
                <div className="mb-4">
                    <h2 className="text-base font-semibold text-foreground">Alert timeline (30 days)</h2>
                    <p className="text-xs text-muted-foreground">Daily alert activity across all your applications.</p>
                </div>
                <TimelineChart data={timeline} />
            </div>

            {/* How alerts work */}
            <div className="rounded-xl border border-info/20 bg-info-muted p-5">
                <h3 className="text-sm font-semibold text-foreground mb-3">How alerts work</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="flex items-start gap-3">
                        <span className="flex items-center justify-center h-7 w-7 rounded-full bg-info text-info-foreground text-xs font-bold shrink-0">1</span>
                        <div>
                            <div className="text-sm font-medium text-foreground">Create a rule</div>
                            <div className="text-[11px] text-muted-foreground">Define what to monitor and when to alert</div>
                        </div>
                    </div>
                    <div className="flex items-start gap-3">
                        <span className="flex items-center justify-center h-7 w-7 rounded-full bg-info text-info-foreground text-xs font-bold shrink-0">2</span>
                        <div>
                            <div className="text-sm font-medium text-foreground">Get notified</div>
                            <div className="text-[11px] text-muted-foreground">We&apos;ll notify you via your preferred channel</div>
                        </div>
                    </div>
                    <div className="flex items-start gap-3">
                        <span className="flex items-center justify-center h-7 w-7 rounded-full bg-info text-info-foreground text-xs font-bold shrink-0">3</span>
                        <div>
                            <div className="text-sm font-medium text-foreground">Take action</div>
                            <div className="text-[11px] text-muted-foreground">Resolve issues and keep your apps healthy</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Create Alert Rule Form */}
            <div className="rounded-xl border border-border/60 bg-card p-5">
                <h2 className="text-base font-semibold text-foreground mb-1">Create alert rule</h2>
                <p className="text-xs text-muted-foreground mb-5">Set up a new rule to monitor your applications.</p>

                <div className="grid grid-cols-1 lg:grid-cols-[1fr,auto] gap-6">
                    <div className="space-y-4">
                        {/* App */}
                        <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">App</label>
                            <select value={appId} onChange={e => setAppId(e.target.value)} className="flex h-9 w-full rounded-lg border border-border/60 bg-background px-3 text-sm">
                                <option value="">Select an app</option>
                                {apps.map(app => <option key={app.id} value={app.id}>{app.name}</option>)}
                            </select>
                        </div>
                        {/* Metric + Condition + Threshold + Duration */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div>
                                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">What to monitor</label>
                                <select value={metric} onChange={e => setMetric(e.target.value as AlertMetric)} className="flex h-9 w-full rounded-lg border border-border/60 bg-background px-3 text-sm">
                                    {metricOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Condition</label>
                                <select value={operator} onChange={e => setOperator(e.target.value as AlertOperator)} className="flex h-9 w-full rounded-lg border border-border/60 bg-background px-3 text-sm">
                                    <option value="GT">&gt; Greater than</option>
                                    <option value="GTE">≥ Greater or equal</option>
                                    <option value="LT">&lt; Less than</option>
                                    <option value="LTE">≤ Less or equal</option>
                                    <option value="EQ">= Equal</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Threshold</label>
                                <Input value={threshold} onChange={e => setThreshold(e.target.value)} placeholder="Enter threshold" className="h-9 border-border/60" />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">For how long?</label>
                                <Input value={durationSec} onChange={e => setDurationSec(e.target.value)} placeholder="Duration (seconds)" className="h-9 border-border/60" />
                            </div>
                        </div>
                        {/* Severity */}
                        <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Severity</label>
                            <div className="flex items-center gap-2">
                                {(["INFO", "WARN", "CRIT"] as AlertSeverity[]).map(s => (
                                    <button key={s} onClick={() => setSeverity(s)} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${severity === s ? severityConfig[s].bg + " " + severityConfig[s].text + " ring-2 ring-offset-1 ring-current" : "bg-muted text-muted-foreground hover:bg-accent"}`}>
                                        <span className={`h-2 w-2 rounded-full ${s === "INFO" ? "bg-info" : s === "WARN" ? "bg-warning" : "bg-danger"}`} />
                                        {severityConfig[s].label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {/* Channel */}
                        <div className="rounded-lg border border-border/60 p-4">
                            <label className="text-xs font-medium text-muted-foreground mb-2 block">Where to send alerts</label>
                            <div className="flex items-center gap-2 mb-3">
                                {(Object.keys(channelTypeConfig) as Array<keyof typeof channelTypeConfig>).map(type => {
                                    const cfg = channelTypeConfig[type];
                                    return (
                                        <button
                                            key={type}
                                            type="button"
                                            disabled={!cfg.available}
                                            onClick={() => setChannelType(type)}
                                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                                                channelType === type
                                                    ? "bg-info-muted text-info-text ring-2 ring-offset-1 ring-info/40"
                                                    : cfg.available
                                                        ? "bg-muted text-muted-foreground hover:bg-accent"
                                                        : "bg-muted text-muted-foreground/50 cursor-not-allowed"
                                            }`}
                                        >
                                            {cfg.label}{!cfg.available && " (soon)"}
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="flex items-center gap-3">
                                <ChannelIcon size={24} />
                                <div className="flex-1 space-y-1.5">
                                    <Input value={channelLabel} onChange={e => setChannelLabel(e.target.value)} placeholder="Channel label" className="h-7 border-border/60 text-xs" />
                                    <Input
                                        value={channelSecret}
                                        onChange={e => setChannelSecret(e.target.value)}
                                        placeholder={channelTypeConfig[channelType].placeholder}
                                        disabled={!channelTypeConfig[channelType].available}
                                        className="h-8 border-border/60 text-xs"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                    {/* Right side hint + actions */}
                    <div className="flex flex-col gap-4 min-w-[200px]">
                        <div className="rounded-lg border border-info/20 bg-info-muted p-4">
                            <div className="text-sm font-medium text-foreground mb-1">Not sure what to monitor?</div>
                            <p className="text-[11px] text-muted-foreground">Choose a metric and we&apos;ll help you set it up.</p>
                        </div>
                        <div className="rounded-lg border border-border/60 p-4">
                            <div className="text-sm font-medium text-foreground mb-1">Test this rule</div>
                            <p className="text-[11px] text-muted-foreground mb-2">Rule testing isn&apos;t available yet.</p>
                            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" disabled>
                                <Play className="h-3 w-3" /> Test Rule (soon)
                            </Button>
                        </div>
                        <div className="flex gap-2 mt-auto">
                            <Button variant="outline" size="sm" className="h-8 text-xs flex-1" onClick={() => { setAppId(""); setMetric("http_5xx_rate"); setOperator("GT"); setThreshold("5"); setDurationSec("300"); setSeverity("INFO"); setChannelSecret(""); }}>Reset</Button>
                            <Button size="sm" className="h-8 text-xs flex-1" onClick={() => createRuleMutation.mutate()} disabled={createRuleMutation.isPending}>Save Rule</Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Configured Rules Table */}
            <div className="rounded-xl border border-border/60 bg-card p-5">
                <h2 className="text-base font-semibold text-foreground mb-1">Configured rules</h2>
                <p className="text-xs text-muted-foreground mb-4">Manage your existing alert rules.</p>

                {/* Filters */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
                    <div className="relative flex-1 max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input placeholder="Search rules..." value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }} className="pl-9 h-8 border-border/60 bg-background text-xs" />
                    </div>
                    <div className="flex items-center gap-2">
                        <Select value={appFilter} onValueChange={v => { setAppFilter(v); setCurrentPage(1); }}>
                            <SelectTrigger className="h-8 w-28 border-border/60 bg-background text-xs"><SelectValue placeholder="All Apps" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Apps</SelectItem>
                                {uniqueApps.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Select value={severityFilter} onValueChange={v => { setSeverityFilter(v); setCurrentPage(1); }}>
                            <SelectTrigger className="h-8 w-32 border-border/60 bg-background text-xs"><SelectValue placeholder="All Severities" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Severities</SelectItem>
                                <SelectItem value="INFO">Info</SelectItem>
                                <SelectItem value="WARN">Warning</SelectItem>
                                <SelectItem value="CRIT">Critical</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setCurrentPage(1); }}>
                            <SelectTrigger className="h-8 w-28 border-border/60 bg-background text-xs"><SelectValue placeholder="All Status" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Status</SelectItem>
                                <SelectItem value="active">Active</SelectItem>
                                <SelectItem value="silenced">Silenced</SelectItem>
                                <SelectItem value="disabled">Disabled</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button variant="outline" size="sm" className="h-8 gap-1 border-border/60 bg-background text-xs"><Filter className="h-3 w-3" /> Filters</Button>
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto rounded-lg border border-border/40">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-border/60 bg-muted/30">
                                <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Rule</th>
                                <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">App</th>
                                <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Severity</th>
                                <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Condition</th>
                                <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Duration</th>
                                <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                                <th className="text-right py-2.5 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedRules.map(rule => {
                                const sev = severityConfig[rule.severity] || severityConfig.INFO;
                                const isActive = rule.enabled && !rule.silencedUntil;
                                const isSilenced = Boolean(rule.silencedUntil);
                                const durationLabel = rule.durationSec >= 60 ? `${Math.round(rule.durationSec / 60)}m` : `${rule.durationSec}s`;
                                return (
                                    <tr key={rule.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                                        <td className="py-3 px-3">
                                            <div className="font-medium text-foreground text-xs">{rule.metricLabel}</div>
                                            <div className="text-[10px] text-muted-foreground">Trigger when {rule.metricLabel.toLowerCase()} is {rule.operator.toLowerCase() === "gt" ? "high" : "low"}</div>
                                        </td>
                                        <td className="py-3 px-3 text-xs text-muted-foreground">{rule.app?.name || rule.server?.name || "—"}</td>
                                        <td className="py-3 px-3">
                                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${sev.bg} ${sev.text}`}>{sev.label}</span>
                                        </td>
                                        <td className="py-3 px-3 font-mono text-xs text-muted-foreground">{operatorLabels[rule.operator] || ""}{rule.threshold}</td>
                                        <td className="py-3 px-3 text-xs text-muted-foreground">{durationLabel}</td>
                                        <td className="py-3 px-3">
                                            <span className={`inline-flex items-center gap-1 text-xs font-medium ${isActive ? "text-success" : isSilenced ? "text-warning" : "text-muted-foreground"}`}>
                                                <span className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-success" : isSilenced ? "bg-warning" : "bg-muted-foreground"}`} />
                                                {isActive ? "Active" : isSilenced ? "Silenced" : "Disabled"}
                                            </span>
                                        </td>
                                        <td className="py-3 px-3 text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => silenceMutation.mutate({ ruleId: rule.id, duration: "1h" })}>Silence 1h</DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => silenceMutation.mutate({ ruleId: rule.id, duration: "4h" })}>Silence 4h</DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => silenceMutation.mutate({ ruleId: rule.id, duration: "until-resolve" })}>Silence until resolved</DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </td>
                                    </tr>
                                );
                            })}
                            {paginatedRules.length === 0 && (
                                <tr><td colSpan={7} className="py-8 text-center text-xs text-muted-foreground">No rules match your filters</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {filteredRules.length > PAGE_SIZE && (
                    <div className="flex items-center justify-between mt-3">
                        <span className="text-xs text-muted-foreground">Showing {((currentPage - 1) * PAGE_SIZE) + 1} to {Math.min(currentPage * PAGE_SIZE, filteredRules.length)} of {filteredRules.length} rules</span>
                        <div className="flex items-center gap-1">
                            <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
                            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(p => (
                                <Button key={p} variant={currentPage === p ? "default" : "outline"} size="sm" className="h-7 w-7 p-0 text-xs" onClick={() => setCurrentPage(p)}>{p}</Button>
                            ))}
                            <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
