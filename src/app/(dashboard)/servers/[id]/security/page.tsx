"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
    ArrowLeft, AlertTriangle, Check, ChevronRight, Clock, Eye, EyeOff, Info, MoreVertical,
    Shield, Search, Lock, Play, ShieldCheck, Globe, LineChart, Cloud, Lightbulb, RotateCw,
} from "lucide-react";
import { toast } from "sonner";
import { useNowTick } from "@/hooks/use-now-tick";
import { FirewallAttackMap } from "@/components/servers/firewall-attack-map";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PlanGate } from "@/components/PlanGate";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { api, type CloudflareWAFTemplate, type FirewallAttackWindow, type FirewallPolicyInput, type FirewallPreviewResponse, type FirewallProfile } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";

const profiles: FirewallProfile[] = ["WEB", "API_ONLY", "INTERNAL", "CUSTOM"];

function parseList(value: string) {
    return value.split(/[,\n]/).map(i => i.trim()).filter(Boolean);
}

function parseCustomRules(value: string) {
    if (!value.trim()) return [];
    return value.split("\n").map(l => l.trim()).filter(Boolean).map(line => {
        const [portRaw, protocolRaw = "tcp", fromCidr = "", ...c] = line.split(",");
        const port = Number(portRaw.trim());
        return { port, protocol: (protocolRaw.trim().toLowerCase() === "udp" ? "udp" : "tcp") as "tcp" | "udp", fromCidr: fromCidr.trim() || undefined, comment: c.join(",").trim() || undefined };
    }).filter(r => Number.isFinite(r.port) && r.port > 0);
}

function buildPolicyInput(profile: FirewallProfile, sshCidrs: string, monitoringIps: string, customRuleText: string): FirewallPolicyInput {
    return { profile, sshCidrs: parseList(sshCidrs), monitoringIps: parseList(monitoringIps), customRules: parseCustomRules(customRuleText) };
}

function wsJobUrl(jobId: string) {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    return `${apiBase.replace(/^http/, "ws")}/jobs/${jobId}/live`;
}

function countdownLabel(value: string | null | undefined, now: number) {
    if (!value) return null;
    const remaining = new Date(value).getTime() - now;
    if (remaining <= 0) return "expired";
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// 5-stage stepper showing the firewall workflow
function SecurityStepper({ currentStage }: { currentStage: number }) {
    const stages = [
        { num: 1, label: "Discovery", desc: "Scan & detect" },
        { num: 2, label: "Policy", desc: "Define rules" },
        { num: 3, label: "Preview", desc: "Validate changes" },
        { num: 4, label: "Confirmed-Commit", desc: "Apply firewall" },
        { num: 5, label: "Monitoring", desc: "Observe & protect" },
    ];
    return (
        <div className="flex items-center justify-between gap-1 sm:gap-3">
            {stages.map((s, i) => (
                <div key={s.num} className="flex items-center flex-1 last:flex-none min-w-0">
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        <div className={`flex items-center justify-center h-9 w-9 rounded-full text-sm font-bold shrink-0 ${
                            currentStage >= s.num ? "bg-info text-info-foreground" : "bg-muted text-muted-foreground"
                        }`}>
                            {currentStage > s.num ? <Check className="h-4 w-4" /> : s.num}
                        </div>
                        <div className="hidden md:block min-w-0">
                            <div className={`text-sm font-semibold truncate ${currentStage >= s.num ? "text-foreground" : "text-muted-foreground"}`}>{s.label}</div>
                            <div className="text-[10px] text-muted-foreground truncate">{s.desc}</div>
                        </div>
                    </div>
                    {i < stages.length - 1 && (
                        <div className={`hidden sm:block flex-1 h-px mx-1 ${currentStage > s.num ? "bg-info" : "bg-border"}`} />
                    )}
                </div>
            ))}
        </div>
    );
}

export default function ServerSecurityPage() {
    const params = useParams();
    const queryClient = useQueryClient();
    const serverId = params.id as string;

    const [profile, setProfile] = useState<FirewallProfile>("WEB");
    const [sshCidrs, setSshCidrs] = useState("0.0.0.0/0");
    const [monitoringIps, setMonitoringIps] = useState("127.0.0.1/32");
    const [customRuleText, setCustomRuleText] = useState("");
    const [cloudflareToken, setCloudflareToken] = useState("");
    const [showToken, setShowToken] = useState(false);
    const [preview, setPreview] = useState<FirewallPreviewResponse | null>(null);
    const [discovery, setDiscovery] = useState<FirewallPreviewResponse["discovery"] | null>(null);
    const [jobStatus, setJobStatus] = useState<{ jobId: string; phase?: string; line?: string; status?: string } | null>(null);
    const [attackWindow, setAttackWindow] = useState<FirewallAttackWindow>("24h");
    const [zoneDrafts, setZoneDrafts] = useState<Record<string, string>>({});

    const policyInput = useMemo(
        () => buildPolicyInput(profile, sshCidrs, monitoringIps, customRuleText),
        [profile, sshCidrs, monitoringIps, customRuleText]
    );

    const { data: state, isLoading } = useQuery({
        queryKey: ["firewall-state", serverId],
        queryFn: () => api.getFirewallState(serverId),
        enabled: !!serverId,
        refetchInterval: 30_000,
    });

    const { data: attacks } = useQuery({
        queryKey: ["firewall-attacks", serverId, attackWindow],
        queryFn: () => api.getFirewallAttacks(serverId, attackWindow),
        enabled: !!serverId,
        refetchInterval: 30_000,
    });

    const resolvedZoneDrafts = useMemo(() => {
        if (!state?.apps) return zoneDrafts;
        const next = { ...zoneDrafts };
        for (const app of state.apps) {
            if (!(app.id in next)) next[app.id] = app.cloudflareZoneId || "";
        }
        return next;
    }, [state?.apps, zoneDrafts]);

    useEffect(() => {
        if (!jobStatus?.jobId) return;
        const socket = new WebSocket(wsJobUrl(jobStatus.jobId));
        socket.onmessage = (event) => {
            const payload = JSON.parse(event.data) as { jobId: string; phase?: string; line?: string; status?: string };
            setJobStatus(c => c?.jobId === jobStatus.jobId ? { ...c, ...payload } : c);
        };
        return () => { socket.close(); };
    }, [jobStatus?.jobId]);

    const discoverMutation = useMutation({
        mutationFn: () => api.discoverFirewall(serverId),
        onSuccess: (result) => { setDiscovery(result.discovery); toast.success("Discovery completed"); },
    });
    const previewMutation = useMutation({
        mutationFn: () => api.previewFirewall(serverId, policyInput),
        onSuccess: (result) => { setDiscovery(result.discovery); setPreview(result); toast.success("Preview ready"); },
    });
    const applyMutation = useMutation({
        mutationFn: () => api.applyFirewall(serverId, policyInput),
        onSuccess: (result) => { setPreview(result.preview); setJobStatus({ jobId: result.jobId, status: result.status }); queryClient.invalidateQueries({ queryKey: ["firewall-state", serverId] }); toast.success("Firewall apply queued"); },
    });
    const keepMutation = useMutation({
        mutationFn: (commitId: string) => api.keepFirewall(serverId, commitId),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["firewall-state", serverId] }); toast.success("Firewall kept"); },
    });
    const revertMutation = useMutation({
        mutationFn: (commitId: string) => api.revertFirewall(serverId, commitId),
        onSuccess: (result) => { setJobStatus({ jobId: result.jobId, status: result.status }); queryClient.invalidateQueries({ queryKey: ["firewall-state", serverId] }); toast.success("Firewall revert queued"); },
    });
    const saveTokenMutation = useMutation({
        mutationFn: () => api.saveCloudflareToken(serverId, cloudflareToken),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["firewall-state", serverId] }); setCloudflareToken(""); toast.success("Cloudflare token saved"); },
    });

    const latestCommit = state?.commits?.[0] || null;
    const now = useNowTick(latestCommit?.status === "pending_confirmation");
    const reduceMotion = useReducedMotion();

    // Determine current stage based on activity
    const currentStage = useMemo(() => {
        if (latestCommit?.status === "active") return 5;
        if (latestCommit?.status === "pending_confirmation") return 4;
        if (preview) return 3;
        if (discovery) return 2;
        return 1;
    }, [latestCommit, preview, discovery]);

    if (isLoading || !state) {
        return (
            <div className="dashboard-page">
                <div className="rounded-xl border border-border bg-card p-8 text-center">
                    <Shield size={48} className="mx-auto mb-3 opacity-60" />
                    <p className="text-sm text-muted-foreground">Loading server security...</p>
                </div>
            </div>
        );
    }

    const lastScanTime = discovery ? "moments ago" : (state.commits[0] ? formatRelativeTime(state.commits[0].createdAt) : "Never");
    const totalRules = preview?.policy.rules.length || (state.commits[0]?.metadata?.ruleCount as number) || 0;
    const hasScanned = Boolean(discovery || state.commits.length > 0);
    const firewallActive = latestCommit?.status === "active";
    const firewallFailed = latestCommit?.status === "failed";
    const autoRevertWindowLabel = latestCommit?.createdAt && latestCommit?.expiresAt
        ? `${Math.max(0, Math.round((new Date(latestCommit.expiresAt).getTime() - new Date(latestCommit.createdAt).getTime()) / 1000))}s`
        : "—";

    return (
        <div className="dashboard-page">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-center gap-3">
                    <Shield size={36} />
                    <div>
                        <div className="flex items-center gap-2.5">
                            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{state.server.name} Security</h1>
                            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                                firewallActive ? "bg-success-muted border-success/30 text-success" :
                                firewallFailed ? "bg-danger-muted border-danger/30 text-danger" :
                                "bg-muted border-border text-muted-foreground"
                            }`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${firewallActive ? "bg-success" : firewallFailed ? "bg-danger" : "bg-muted-foreground/50"}`} />
                                {firewallActive ? "Active" : firewallFailed ? "Failed" : latestCommit ? "Pending" : "Not configured"}
                            </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">Five-stage firewall control with delayed auto-revert, Cloudflare hardening, and attack telemetry.</p>
                    </div>
                </div>
                <Button variant="outline" size="sm" className="h-9 gap-2 border-border" asChild>
                    <Link href={`/servers/${serverId}`}><ArrowLeft className="h-4 w-4" /> Back to server</Link>
                </Button>
            </div>

            {/* Stepper */}
            <div className="rounded-xl border border-border bg-card p-5">
                <SecurityStepper currentStage={currentStage} />
            </div>

            {/* Pending confirmation banner — State-tier (200ms ease-out) entrance/exit
                since this is a state change (a confirmed-commit window opening/closing),
                not decoration. No glass here: this flow is a safety feature and needs
                max contrast, not translucency (doc 03 Group C). */}
            <AnimatePresence>
            {latestCommit?.status === "pending_confirmation" && (
                <motion.div
                    key="pending-confirmation-banner"
                    initial={reduceMotion ? false : { opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="rounded-xl border border-warning/30 bg-warning-muted p-4 flex items-center justify-between gap-4"
                >
                    <div className="flex items-center gap-3">
                        <Clock className="h-5 w-5 text-warning-text shrink-0" />
                        <div>
                            <div className="text-sm font-semibold text-warning-text">Confirmed-commit active</div>
                            <div className="text-xs text-warning-text">Keep this firewall before auto-revert triggers • <span className="font-mono font-bold">{countdownLabel(latestCommit.expiresAt, now)}</span></div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button size="sm" className="h-8 bg-success hover:bg-success text-success-foreground" onClick={() => keepMutation.mutate(latestCommit.id)} disabled={keepMutation.isPending}>Keep firewall</Button>
                        <Button size="sm" variant="outline" className="h-8 border-warning/30 text-warning-text" onClick={() => revertMutation.mutate(latestCommit.id)} disabled={revertMutation.isPending}>Revert now</Button>
                    </div>
                </motion.div>
            )}
            </AnimatePresence>

            {/* 70/30 layout — main content + sticky right rail */}
            <div className="flex flex-col md:flex-row gap-5 items-start">
                {/* Left: 70% main content */}
                <div className="flex-1 min-w-0 space-y-5 w-full">
                    <PlanGate feature="server.firewallControls">
                        {/* 1. Discovery */}
                        <div className="rounded-xl border border-border bg-card p-5">
                            <div className="flex items-center gap-2 mb-1">
                                <Search size={20} />
                                <h2 className="text-base font-semibold text-foreground">1. Discovery</h2>
                            </div>
                            <p className="text-xs text-muted-foreground mb-4">Discover open ports and services running on this server.</p>
                            <div className="grid grid-cols-1 md:grid-cols-[auto,1fr,auto,auto] gap-3 items-center">
                                <Button size="sm" className="h-9 bg-success hover:bg-success text-success-foreground gap-2" onClick={() => discoverMutation.mutate()} disabled={discoverMutation.isPending}>
                                    <Search size={16} /> Scan listening ports
                                </Button>
                                <div />
                                <div className="text-center md:text-right">
                                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Last scan</div>
                                    <div className="text-sm text-foreground">{lastScanTime}</div>
                                </div>
                                <div className="text-center md:text-right">
                                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Status</div>
                                    <div className={`text-sm font-medium flex items-center gap-1 justify-center md:justify-end ${hasScanned ? "text-success" : "text-muted-foreground"}`}>
                                        <span className={`h-1.5 w-1.5 rounded-full ${hasScanned ? "bg-success" : "bg-muted-foreground/50"}`} /> {hasScanned ? "Completed" : "Not scanned yet"}
                                    </div>
                                </div>
                            </div>
                            {discovery && discovery.ports.length > 0 && (
                                <div className="mt-4 grid gap-2 md:grid-cols-2">
                                    {discovery.ports.map(port => (
                                        <div key={`${port.proto}-${port.port}-${port.process}`} className="rounded-lg border border-border p-3">
                                            <div className="flex items-center justify-between">
                                                <span className="font-mono text-sm font-medium text-foreground">{port.port}/{port.proto}</span>
                                                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-muted text-muted-foreground">{port.classification}</span>
                                            </div>
                                            <p className="text-[11px] text-muted-foreground mt-1">{port.process || port.containerName || "unknown process"}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* 2. Policy */}
                        <div className="rounded-xl border border-border bg-card p-5">
                            <div className="flex items-center gap-2 mb-1">
                                <Lock size={20} />
                                <h2 className="text-base font-semibold text-foreground">2. Policy</h2>
                            </div>
                            <p className="text-xs text-muted-foreground mb-4">Define firewall rules for incoming traffic.</p>

                            {/* Profile tabs */}
                            <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 mb-4 max-w-md">
                                {profiles.map(p => (
                                    <button
                                        key={p}
                                        onClick={() => setProfile(p)}
                                        className={`flex-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                                            profile === p ? "bg-info text-info-foreground" : "text-muted-foreground hover:text-foreground"
                                        }`}
                                    >
                                        {p === "API_ONLY" ? "API_ONLY" : p}
                                    </button>
                                ))}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block flex items-center gap-1">
                                        SSH CIDRs <Info className="h-3 w-3 opacity-50" />
                                    </label>
                                    <Input value={sshCidrs} onChange={e => setSshCidrs(e.target.value)} className="h-9 border-border bg-background font-mono text-xs" />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block flex items-center gap-1">
                                        Monitoring IPs <Info className="h-3 w-3 opacity-50" />
                                    </label>
                                    <Input value={monitoringIps} onChange={e => setMonitoringIps(e.target.value)} className="h-9 border-border bg-background font-mono text-xs" />
                                </div>
                            </div>
                            <div className="mt-4">
                                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Custom rules</label>
                                <Textarea value={customRuleText} onChange={e => setCustomRuleText(e.target.value)} rows={3} placeholder="8080,tcp,10.0.0.0/8,Internal API" className="border-border bg-background font-mono text-xs resize-none" />
                                <p className="text-[10px] text-muted-foreground mt-1.5">Need help? <a href="#" className="text-info-text hover:text-info font-medium">View rule syntax examples →</a></p>
                            </div>
                        </div>

                        {/* 3. Preview */}
                        <div className="rounded-xl border border-border bg-card p-5">
                            <div className="flex items-center gap-2 mb-1">
                                <Eye size={20} />
                                <h2 className="text-base font-semibold text-foreground">3. Preview</h2>
                            </div>
                            <p className="text-xs text-muted-foreground mb-4">Review the firewall changes before applying.</p>
                            <div className="grid grid-cols-1 md:grid-cols-[1fr,auto] gap-4 items-start">
                                {/* Left: action */}
                                <div>
                                    <Button
                                        size="sm"
                                        className="h-10 px-4 bg-info hover:bg-info text-info-foreground gap-2 font-medium"
                                        onClick={() => previewMutation.mutate()}
                                        disabled={previewMutation.isPending}
                                    >
                                        Build preview
                                        <Play size={16} />
                                    </Button>
                                </div>
                                {/* Right: stats card */}
                                <div className="rounded-lg border border-border bg-card px-6 py-3 flex items-center gap-10 min-w-[280px]">
                                    <div>
                                        <div className="text-[11px] text-muted-foreground">Rules to be applied</div>
                                        <div className="text-xl font-bold text-foreground mt-0.5">{totalRules}</div>
                                    </div>
                                </div>
                            </div>
                            {preview && preview.previewCommands.length > 0 && (
                                <Textarea readOnly rows={6} value={preview.previewCommands.join("\n")} className="mt-4 border-border bg-muted/30 font-mono text-[11px] resize-none" />
                            )}
                        </div>

                        {/* 4. Confirmed-Commit */}
                        <div className="rounded-xl border border-border bg-card p-5">
                            <div className="flex items-center gap-2 mb-1">
                                <ShieldCheck size={20} />
                                <h2 className="text-base font-semibold text-foreground">4. Confirmed-Commit</h2>
                            </div>
                            <p className="text-xs text-muted-foreground mb-4">Apply the firewall rules. This action is atomic and monitored.</p>
                            <div className="grid grid-cols-1 md:grid-cols-[1fr,auto] gap-4 items-start">
                                {/* Left: action */}
                                <div>
                                    <Button
                                        size="sm"
                                        className="h-10 px-4 bg-success hover:bg-success/90 text-success-foreground gap-2 font-medium"
                                        onClick={() => applyMutation.mutate()}
                                        disabled={applyMutation.isPending}
                                    >
                                        Apply firewall
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4.09 12.97a.5.5 0 0 0 .39.81H11l-1 8.22a.5.5 0 0 0 .89.36L20.91 11.4a.5.5 0 0 0-.39-.81H14l1-8.22a.5.5 0 0 0-.89-.37z" /></svg>
                                    </Button>
                                </div>
                                {/* Right: stats card */}
                                <div className="rounded-lg border border-border bg-card px-6 py-3 flex items-center gap-10 min-w-[280px]">
                                    <div>
                                        <div className="text-[11px] text-muted-foreground">Last applied</div>
                                        <div className="text-sm font-semibold text-foreground mt-1">{state.commits[0] ? formatRelativeTime(state.commits[0].createdAt) : "Never"}</div>
                                    </div>
                                    <div>
                                        <div className="text-[11px] text-muted-foreground">Result</div>
                                        <div className={`text-sm font-semibold flex items-center gap-1.5 mt-1 ${
                                            state.commits[0]?.status === "active" ? "text-success" :
                                            state.commits[0]?.status === "failed" ? "text-danger" : "text-warning"
                                        }`}>
                                            {state.commits[0]?.status === "active" ? "Active" : state.commits[0]?.status === "failed" ? <>Failed <AlertTriangle className="h-3.5 w-3.5" /></> : "Pending"}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {state.commits[0] && (
                                <div className="mt-4 rounded-lg border border-border p-3 flex items-center gap-3">
                                    <div className="h-9 w-9 rounded-full border border-border flex items-center justify-center shrink-0">
                                        <Globe size={20} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-bold text-foreground tracking-wide">{state.commits[0].profile}</div>
                                        <div className="text-[11px] text-muted-foreground font-mono truncate">{state.commits[0].id}</div>
                                    </div>
                                    <Button variant="outline" size="sm" className="h-8 text-xs border-border px-3">View logs</Button>
                                </div>
                            )}

                            {jobStatus && (
                                <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3 text-xs">
                                    <div className="font-medium text-foreground">Job: <span className="font-mono text-muted-foreground">{jobStatus.jobId}</span></div>
                                    <div className="text-muted-foreground mt-1">Status: <span className="text-foreground">{jobStatus.status || "running"}</span> • Phase: <span className="text-foreground">{jobStatus.phase || "dispatching"}</span></div>
                                    {jobStatus.line && <div className="text-muted-foreground mt-0.5 font-mono">{jobStatus.line}</div>}
                                </div>
                            )}
                        </div>
                    </PlanGate>

                    {/* 5. Monitoring */}
                    <div className="rounded-xl border border-border bg-card p-5">
                        <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                                <LineChart size={20} />
                                <h2 className="text-base font-semibold text-foreground">5. Monitoring</h2>
                            </div>
                            <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
                                {(["1h", "24h", "7d"] as FirewallAttackWindow[]).map(w => (
                                    <button
                                        key={w}
                                        onClick={() => setAttackWindow(w)}
                                        className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                                            attackWindow === w ? "bg-info text-info-foreground" : "text-muted-foreground hover:text-foreground"
                                        }`}
                                    >
                                        {w}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground mb-4">Monitor attacks, blocked requests, and traffic patterns.</p>

                        {/* Attack Map */}
                        <div className="rounded-lg border border-border p-4 mb-4">
                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <div className="text-sm font-semibold text-foreground">Attack Map</div>
                                    <div className="text-[11px] text-muted-foreground">Country-level {attackWindow} deny telemetry</div>
                                </div>
                                <span className="text-[11px] text-success-text font-medium">{(attacks?.countries || []).length} active countries</span>
                            </div>
                            <FirewallAttackMap countries={attacks?.countries || []} />
                            <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
                                <span>Low</span>
                                <div className="flex-1 mx-3 h-1.5 rounded-full bg-gradient-to-r from-info/20 via-info/60 to-info" />
                                <span>High</span>
                            </div>
                        </div>

                        {/* Top Sources + Targeted Ports */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="rounded-lg border border-border p-4">
                                <h3 className="text-sm font-semibold text-foreground mb-3">Top Sources</h3>
                                <div className="space-y-2">
                                    {(attacks?.sources || []).slice(0, 5).map(s => {
                                        const max = Math.max(...(attacks?.sources || []).map(x => x.count), 1);
                                        const pct = (s.count / max) * 100;
                                        return (
                                            <div key={`${s.src_ip_text}-${s.country}`} className="flex items-center gap-2">
                                                <span className="font-mono text-[11px] text-foreground w-32 truncate">{s.src_ip_text}</span>
                                                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full bg-info" style={{ width: `${pct}%` }} /></div>
                                                <span className="font-mono text-[11px] text-foreground w-10 text-right">{s.count}</span>
                                            </div>
                                        );
                                    })}
                                    {(!attacks?.sources || attacks.sources.length === 0) && <p className="text-xs text-muted-foreground text-center py-4">No sources detected</p>}
                                </div>
                            </div>
                            <div className="rounded-lg border border-border p-4">
                                <h3 className="text-sm font-semibold text-foreground mb-3">Targeted Ports</h3>
                                <div className="space-y-2">
                                    {(attacks?.ports || []).slice(0, 5).map(p => {
                                        const max = Math.max(...(attacks?.ports || []).map(x => x.count), 1);
                                        const pct = (p.count / max) * 100;
                                        return (
                                            <div key={`${p.port}-${p.proto}`} className="flex items-center gap-2">
                                                <span className="font-mono text-[11px] text-foreground w-24">{p.port} / {p.proto.toUpperCase()}</span>
                                                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full bg-info" style={{ width: `${pct}%` }} /></div>
                                                <span className="font-mono text-[11px] text-foreground w-10 text-right">{p.count}</span>
                                            </div>
                                        );
                                    })}
                                    {(!attacks?.ports || attacks.ports.length === 0) && <p className="text-xs text-muted-foreground text-center py-4">No targeted ports</p>}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Cloudflare Integration */}
                    <PlanGate feature="server.firewallControls" fallback={null}>
                        <div className="rounded-xl border border-border bg-card p-5">
                            <div className="flex items-center gap-2 mb-1">
                                <Cloud size={20} />
                                <h2 className="text-base font-semibold text-foreground">Cloudflare Integration</h2>
                            </div>
                            <p className="text-xs text-muted-foreground mb-4">Protect your applications at the edge with Cloudflare.</p>

                            <div className="rounded-lg border border-warning/30 bg-warning-muted p-3 mb-4 flex items-start gap-2">
                                <AlertTriangle className="h-4 w-4 text-warning-text mt-0.5 shrink-0" />
                                <div className="text-xs text-warning-text">
                                    <strong>Zone-scoped token only.</strong> Save a Cloudflare API token first, then assign zone IDs per app to toggle Under Attack Mode and apply WAF templates.
                                </div>
                            </div>

                            <div className="mb-5">
                                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Cloudflare API Token</label>
                                <div className="flex items-center gap-2">
                                    <div className="relative flex-1">
                                        <Input type={showToken ? "text" : "password"} value={cloudflareToken} onChange={e => setCloudflareToken(e.target.value)} placeholder="cf-api-token-•••••••••" className="pr-9 h-9 border-border bg-background font-mono text-xs" />
                                        <button type="button" onClick={() => setShowToken(!showToken)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                                            {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                    <Button size="sm" className="h-9 bg-info hover:bg-info text-info-foreground" onClick={() => saveTokenMutation.mutate()} disabled={saveTokenMutation.isPending || !cloudflareToken}>Save token</Button>
                                </div>
                                {state.cloudflare?.configured && (
                                    <p className="text-[11px] text-success-text mt-1.5 flex items-center gap-1"><Check className="h-3 w-3" /> Token saved · {state.cloudflare.tokenName || "verified"}</p>
                                )}
                            </div>

                            <div className="space-y-2">
                                {state.apps.map(app => (
                                    <CloudflareAppRow
                                        key={app.id}
                                        serverId={serverId}
                                        app={app}
                                        zoneId={resolvedZoneDrafts[app.id] || ""}
                                        setZoneId={(value) => setZoneDrafts(c => ({ ...c, [app.id]: value }))}
                                        onSaved={() => queryClient.invalidateQueries({ queryKey: ["firewall-state", serverId] })}
                                    />
                                ))}
                                {state.apps.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No apps deployed on this server yet</p>}
                            </div>
                        </div>
                    </PlanGate>
                </div>

                {/* Right: 30% sidebar */}
                <aside className="w-full md:w-[260px] md:shrink-0 space-y-4 md:sticky md:top-4 md:self-start">
                    {/* Security at a glance */}
                    <div className="rounded-xl border border-border bg-card p-5">
                        <div className="flex items-center gap-2 mb-3">
                            <Shield size={20} />
                            <h3 className="text-sm font-semibold text-foreground">Security at a glance</h3>
                        </div>
                        <div className="space-y-2.5">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">Status</span>
                                <span className={`font-medium ${firewallActive ? "text-success" : firewallFailed ? "text-danger" : "text-muted-foreground"}`}>
                                    {firewallActive ? "Active" : firewallFailed ? "Failed" : latestCommit ? "Pending" : "Not configured"}
                                </span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">Firewall</span>
                                <span className={`font-medium ${firewallActive ? "text-success" : "text-muted-foreground"}`}>
                                    {firewallActive ? "Enabled" : "Not enabled"}
                                </span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">Auto-revert window</span>
                                <span className="text-foreground font-medium">{autoRevertWindowLabel}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">Last scan</span>
                                <span className="text-foreground font-medium">{lastScanTime}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">Last change</span>
                                <span className="text-foreground font-medium">{state.commits[0] ? formatRelativeTime(state.commits[0].updatedAt) : "Never"}</span>
                            </div>
                        </div>
                    </div>

                    {/* Configuration Guide */}
                    <div className="rounded-xl border border-border bg-card p-5">
                        <div className="flex items-center gap-2 mb-3">
                            <Info size={20} />
                            <h3 className="text-sm font-semibold text-foreground">Configuration Guide</h3>
                        </div>
                        <p className="text-[11px] text-muted-foreground mb-4">Understand each stage.</p>
                        <div className="space-y-3.5">
                            {[
                                { icon: Search, title: "Discovery", desc: "Scan your server to discover open ports and services." },
                                { icon: Lock, title: "Policy", desc: "Define who can access and which ports are allowed." },
                                { icon: Eye, title: "Preview", desc: "Validate changes and review the impact." },
                                { icon: ShieldCheck, title: "Confirmed-Commit", desc: "Apply rules safely with auto-revert protection." },
                                { icon: LineChart, title: "Monitoring", desc: "Observe attacks, traffic, and patterns." },
                            ].map(item => (
                                <div key={item.title} className="flex items-start gap-2.5">
                                    <div className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center shrink-0">
                                        <item.icon size={16} />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-xs font-semibold text-foreground">{item.title}</div>
                                        <div className="text-[10px] text-muted-foreground leading-relaxed">{item.desc}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* What happens next? */}
                    <div className="rounded-xl border border-border bg-card p-5">
                        <div className="flex items-center gap-2 mb-3">
                            <Play size={20} />
                            <h3 className="text-sm font-semibold text-foreground">What happens next?</h3>
                        </div>
                        <div className="space-y-3">
                            {[
                                { num: 1, title: "We scan your server", desc: "Discover open ports and services." },
                                { num: 2, title: "You set the policy", desc: "Define rules for incoming traffic." },
                                { num: 3, title: "We preview changes", desc: "Validate and estimate impact." },
                                { num: 4, title: "We apply safely", desc: "Firewall is applied with auto-revert." },
                                { num: 5, title: "You stay protected", desc: "We monitor and keep you safe." },
                            ].map(step => (
                                <div key={step.num} className="flex items-start gap-2.5">
                                    <span className="flex items-center justify-center h-5 w-5 rounded-full bg-info-muted text-info-text text-[10px] font-bold shrink-0 mt-0.5">{step.num}</span>
                                    <div>
                                        <div className="text-xs font-semibold text-foreground">{step.title}</div>
                                        <div className="text-[10px] text-muted-foreground leading-relaxed">{step.desc}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Tips */}
                    <div className="rounded-xl border border-warning/30 bg-warning-muted/50 p-5">
                        <div className="flex items-center gap-2 mb-3">
                            <Lightbulb size={20} />
                            <h3 className="text-sm font-semibold text-warning-text">Tips</h3>
                        </div>
                        <div className="space-y-2.5">
                            {[
                                { icon: Lock, title: "Use narrow CIDRs", desc: "Restrict access to trusted IP ranges." },
                                { icon: RotateCw, title: "Enable auto-revert", desc: "Rollback on failure within 90s." },
                                { icon: LineChart, title: "Monitor regularly", desc: "Check attack map and logs often." },
                            ].map(tip => (
                                <div key={tip.title} className="flex items-start gap-2.5">
                                    <tip.icon size={16} className="mt-0.5 shrink-0" />
                                    <div>
                                        <div className="text-[11px] font-semibold text-warning-text">{tip.title}</div>
                                        <div className="text-[10px] text-warning-text leading-relaxed">{tip.desc}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    );
}

function CloudflareAppRow({
    serverId,
    app,
    zoneId,
    setZoneId,
    onSaved,
}: {
    serverId: string;
    app: { id: string; name: string; domain?: string | null; cloudflareZoneId?: string | null };
    zoneId: string;
    setZoneId: (value: string) => void;
    onSaved: () => void;
}) {
    const zoneMutation = useMutation({
        mutationFn: () => api.setCloudflareZone(serverId, app.id, zoneId),
        onSuccess: () => { toast.success(`Saved zone for ${app.name}`); onSaved(); },
    });
    const uamMutation = useMutation({
        mutationFn: (enabled: boolean) => api.setCloudflareUnderAttackMode(serverId, app.id, enabled),
        onSuccess: (_, enabled) => { toast.success(enabled ? `UAM enabled for ${app.name}` : `UAM disabled for ${app.name}`); },
    });
    const wafMutation = useMutation({
        mutationFn: (template: CloudflareWAFTemplate) => api.applyCloudflareTemplate(serverId, app.id, template),
        onSuccess: (_, template) => { toast.success(`Applied ${template} to ${app.name}`); },
    });

    return (
        <div className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                    <Globe size={24} />
                    <div>
                        <div className="text-sm font-semibold text-foreground">{app.name}</div>
                        <div className="text-[11px] text-muted-foreground">{app.domain || "No domain assigned"}</div>
                    </div>
                </div>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><MoreVertical className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => uamMutation.mutate(true)} disabled={!zoneId}>Enable UAM</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => uamMutation.mutate(false)} disabled={!zoneId}>Disable UAM</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
                <Input value={zoneId} onChange={e => setZoneId(e.target.value)} placeholder="Cloudflare zone ID" className="flex-1 min-w-[180px] h-8 border-border bg-background font-mono text-xs" />
                <Button size="sm" className="h-8 bg-info hover:bg-info text-info-foreground text-xs" onClick={() => zoneMutation.mutate()} disabled={zoneMutation.isPending || !zoneId}>Save zone</Button>
                <Button size="sm" variant="outline" className="h-8 border-border text-xs" onClick={() => uamMutation.mutate(true)} disabled={uamMutation.isPending || !zoneId}>Enable UAM</Button>
                <Button size="sm" variant="outline" className="h-8 border-border text-xs" onClick={() => uamMutation.mutate(false)} disabled={uamMutation.isPending || !zoneId}>Disable UAM</Button>
                {(["xss", "sqli", "country_block"] as CloudflareWAFTemplate[]).map(t => (
                    <Button key={t} size="sm" variant="outline" className="h-8 border-border text-xs" onClick={() => wafMutation.mutate(t)} disabled={wafMutation.isPending || !zoneId}>
                        Apply {t === "xss" ? "XSS" : t === "sqli" ? "SQLi" : "Country Block"}
                    </Button>
                ))}
            </div>
        </div>
    );
}
