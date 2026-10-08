"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, Cpu, Download, FileText, HeartPulse, Info, Container, RotateCw, Trash2, Terminal as TerminalIcon, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { AgentInstallCommands } from "@/components/servers/agent-install-commands";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, type Server } from "@/lib/api";
import { cn, formatRelativeTime } from "@/lib/utils";
import { isSshUnavailable } from "../connect/shared";

const ACTIONS: Array<{ action: string; label: string; icon: LucideIcon }> = [
    { action: "agent_status", label: "Status", icon: Info },
    { action: "agent_logs", label: "Logs", icon: FileText },
    { action: "system_health", label: "Health", icon: HeartPulse },
    { action: "docker_ps", label: "Containers", icon: Container },
    { action: "agent_restart", label: "Restart agent", icon: RotateCw },
];

function Section({ title, subtitle, children, className }: { title: string; subtitle: string; children: React.ReactNode; className?: string }) {
    return (
        <Card className={cn("gap-0 rounded-2xl py-0 shadow-xs", className)}>
            <div className="px-5 pt-5">
                <h2 className="text-lg font-semibold text-foreground">{title}</h2>
                <p className="text-sm text-muted-foreground">{subtitle}</p>
            </div>
            <div className="p-5">{children}</div>
        </Card>
    );
}

function GeneralSection({ server }: { server: Server }) {
    const queryClient = useQueryClient();
    const [name, setName] = useState(server.name);
    const save = useMutation({
        mutationFn: () => api.renameServer(server.id, name.trim()),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["server", server.id] });
            queryClient.invalidateQueries({ queryKey: ["servers"] });
            toast.success("Server renamed");
        },
        onError: (error) => toast.error(isSshUnavailable(error) ? "Renaming isn't available on this workspace yet." : "Couldn't save the name."),
    });
    return (
        <Section title="General" subtitle="Basic identification for this server">
            <div className="space-y-1.5">
                <Label htmlFor="server-name">Server name</Label>
                <Input id="server-name" value={name} maxLength={64} onChange={(e) => setName(e.target.value)} className="h-10 rounded-xl" />
            </div>
            <div className="mt-4 flex justify-end">
                <Button variant="dark" disabled={!name.trim() || name.trim() === server.name || save.isPending} onClick={() => save.mutate()}>Save changes</Button>
            </div>
        </Section>
    );
}

function AgentSection({ server, isLive, updateVersion, onUpdate }: { server: Server; isLive: boolean; updateVersion?: string | null; onUpdate: () => void }) {
    const queryClient = useQueryClient();
    const { data: info } = useQuery({ queryKey: ["agent-control", server.id], queryFn: () => api.getAgentControl(server.id), refetchInterval: 15_000 });
    const run = useMutation({
        mutationFn: (payload: { action: string; args?: Record<string, unknown> }) => api.runAgentControlAction(server.id, { action: payload.action as never, args: payload.args }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["agent-control", server.id] });
            toast.success("Action queued");
        },
        onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Action failed"),
    });
    const helperReady = info?.helperStatus === "active" || info?.helperStatus === "available";
    const disabled = !info?.connected || !info?.isSecureControlCapable || !info.secureControl || !helperReady;
    const last = info?.lastPrivilegedAction;
    return (
        <Section title="Agent" subtitle="Manage the agent running on your server">
            <div className="flex items-center gap-3 rounded-xl border p-3.5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-success-muted text-success-text"><Cpu className="size-5" aria-hidden="true" /></span>
                <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground">Agent v{info?.currentVersion || server.agentVersion || "—"}</p>
                    <p className="text-sm text-muted-foreground">
                        Helper {helperReady ? "active" : info?.helperStatus || "inactive"} · {isLive ? "Connected just now" : "Offline"}
                    </p>
                </div>
                {updateVersion ? (
                    <Button onClick={onUpdate}><Download aria-hidden="true" /> Update to v{updateVersion}</Button>
                ) : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
                {ACTIONS.map((item) => (
                    <Button
                        key={item.action}
                        variant="outline"
                        disabled={disabled || run.isPending}
                        onClick={() => run.mutate({ action: item.action, args: item.action === "agent_logs" ? { lines: 120 } : undefined })}
                    >
                        <item.icon aria-hidden="true" /> {item.label}
                    </Button>
                ))}
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
                {last ? (
                    <>
                        {last.status === "COMPLETED" ? <CheckCircle2 className="size-4 text-success-text" aria-hidden="true" /> : <Clock className="size-4 text-warning-text" aria-hidden="true" />}
                        Last privileged action: {last.status.toLowerCase()} {last.endedAt ? formatRelativeTime(last.endedAt) : ""}
                    </>
                ) : (
                    "Last privileged action: none"
                )}
            </p>
        </Section>
    );
}

function ConnectionSection({ server }: { server: Server }) {
    const [showCommand, setShowCommand] = useState(false);
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL || "http://localhost:3000";
    return (
        <Section title="Connection" subtitle="How Opslin connects to this server">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <dl className="flex gap-10">
                    <div>
                        <dt className="text-xs text-muted-foreground">{server.publicIp ? "Public IP" : "IP address"}</dt>
                        <dd className="mt-0.5 font-semibold text-foreground">{server.publicIp || server.ip || "—"}</dd>
                    </div>
                    {server.publicIp && server.ip ? (
                        <div>
                            <dt className="text-xs text-muted-foreground">Private IP</dt>
                            <dd className="mt-0.5 font-semibold text-foreground">{server.ip}</dd>
                        </div>
                    ) : null}
                </dl>
                <Button variant="outline" onClick={() => setShowCommand((v) => !v)} aria-expanded={showCommand}>
                    <TerminalIcon aria-hidden="true" /> Reinstall agent
                </Button>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">Reinstalling refreshes the agent without removing your apps.</p>
            {showCommand ? (
                <div className="mt-3">
                    <AgentInstallCommands apiUrl={apiUrl} dashboardUrl={dashboardUrl} compact showEndpoints={false} />
                </div>
            ) : null}
        </Section>
    );
}

export function SettingsTab({ server, isLive, updateVersion, onUpdate, onDelete }: { server: Server; isLive: boolean; updateVersion?: string | null; onUpdate: () => void; onDelete: () => void }) {
    return (
        <div className="mx-auto max-w-3xl space-y-5">
            <GeneralSection server={server} />
            <AgentSection server={server} isLive={isLive} updateVersion={updateVersion} onUpdate={onUpdate} />
            <ConnectionSection server={server} />
            <Card className="gap-0 rounded-2xl border-danger/30 bg-danger-muted/30 py-0 shadow-none">
                <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-danger-text">Danger zone</h2>
                        <p className="text-sm text-muted-foreground">Remove this server from Opslin. Your apps keep running on the machine but will no longer be managed.</p>
                    </div>
                    <Button variant="outline" className="border-danger/40 text-danger-text hover:bg-danger-muted hover:text-danger-text" onClick={onDelete}>
                        <Trash2 aria-hidden="true" /> Delete server
                    </Button>
                </div>
            </Card>
        </div>
    );
}
