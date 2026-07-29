"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, CheckCircle2, Clock, FileText, Loader2, Power, RotateCw, ServerCog, ShieldCheck, TerminalSquare } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, ApiRequestError, type AgentControlActionName } from "@/lib/api";

type AgentControlPanelProps = {
    serverId: string;
};

const quickActions: Array<{
    action: AgentControlActionName;
    label: string;
    description: string;
    icon: typeof Activity;
    args?: Record<string, unknown>;
}> = [
    {
        action: "agent_status",
        label: "Status",
        description: "Check agent and helper services.",
        icon: ServerCog,
    },
    {
        action: "agent_logs",
        label: "Logs",
        description: "Fetch recent agent logs.",
        icon: FileText,
        args: { lines: 120 },
    },
    {
        action: "system_health",
        label: "Health",
        description: "Read uptime and disk state.",
        icon: Activity,
    },
    {
        action: "docker_ps",
        label: "Containers",
        description: "List Opslin-managed containers.",
        icon: TerminalSquare,
    },
    {
        action: "agent_restart",
        label: "Restart",
        description: "Restart only the Opslin agent.",
        icon: Power,
    },
];

export function AgentControlPanel({ serverId }: AgentControlPanelProps) {
    const queryClient = useQueryClient();
    const controlQuery = useQuery({
        queryKey: ["agent-control", serverId],
        queryFn: () => api.getAgentControl(serverId),
        enabled: Boolean(serverId),
        refetchInterval: 10000,
    });

    const actionMutation = useMutation({
        mutationFn: (action: typeof quickActions[number]) =>
            api.runAgentControlAction(serverId, {
                action: action.action,
                args: action.args,
                timeoutSeconds: 20,
            }),
        onSuccess: async (result) => {
            toast.success(`${result.action.replaceAll("_", " ")} queued`);
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["agent-control", serverId] }),
                queryClient.invalidateQueries({ queryKey: ["server", serverId] }),
            ]);
        },
        onError: (error) => {
            if (error instanceof ApiRequestError && error.details.message) {
                toast.error(error.details.message);
                return;
            }
            toast.error(error instanceof Error ? error.message : "Unable to run agent action");
        },
    });

    const info = controlQuery.data;
    const helperReady = info?.helperStatus === "active" || info?.helperStatus === "available";
    const disabled = !info?.connected || !info?.isSecureControlCapable || !info.secureControl || !helperReady;

    return (
        <Card className="dashboard-surface">
            <CardHeader className="gap-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <ShieldCheck className="size-5 text-primary" />
                            Agent 2.0 Secure Control
                        </CardTitle>
                        <CardDescription>Controlled VPS actions without exposing a root terminal.</CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Badge variant={info?.connected ? "secondary" : "destructive"}>
                            {info?.connected ? "Online" : "Offline"}
                        </Badge>
                        <Badge variant={info?.isSecureControlCapable ? "secondary" : "outline"}>
                            Agent {info?.currentVersion || "unknown"}
                        </Badge>
                        <Badge variant={helperReady ? "secondary" : "outline"}>
                            Helper {info?.helperStatus || "unknown"}
                        </Badge>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {controlQuery.isLoading && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" />
                        Loading agent control state...
                    </div>
                )}

                {disabled && info && (
                    <Alert className="border-chart-4/40 bg-chart-4/10">
                        <ShieldCheck className="size-4 text-chart-4" />
                        <AlertTitle>Secure control unavailable</AlertTitle>
                        <AlertDescription>
                            Install Agent {info.minimumSecureControlVersion} with the latest installer to enable helper-backed actions.
                        </AlertDescription>
                    </Alert>
                )}

                <div className="grid gap-3 md:grid-cols-5">
                    {quickActions.map((item) => (
                        <Button
                            key={item.action}
                            id={`agent-control-${item.action}`}
                            type="button"
                            variant={item.action === "agent_restart" ? "outline" : "secondary"}
                            className="h-auto min-h-24 flex-col items-start justify-start gap-2 whitespace-normal p-4 text-left"
                            disabled={disabled || actionMutation.isPending}
                            onClick={() => actionMutation.mutate(item)}
                        >
                            <item.icon className="size-5" />
                            <span className="text-sm font-medium">{item.label}</span>
                            <span className="text-xs font-normal text-muted-foreground">{item.description}</span>
                        </Button>
                    ))}
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-border/70 bg-secondary/25 p-4">
                        <p className="dashboard-section-label">Running job</p>
                        <p className="mt-2 text-sm text-foreground">
                            {info?.runningJob ? `${info.runningJob.type} · ${info.runningJob.id}` : "No running agent job"}
                        </p>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-secondary/25 p-4">
                        <p className="dashboard-section-label">Last privileged action</p>
                        <p className="mt-2 flex items-center gap-2 text-sm text-foreground">
                            {info?.lastPrivilegedAction ? (
                                <>
                                    {info.lastPrivilegedAction.status === "COMPLETED" ? (
                                        <CheckCircle2 className="size-4 text-chart-5" />
                                    ) : (
                                        <Clock className="size-4 text-chart-4" />
                                    )}
                                    {info.lastPrivilegedAction.status}
                                </>
                            ) : "No privileged action yet"}
                        </p>
                    </div>
                </div>

                {actionMutation.isPending && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <RotateCw className="size-4 animate-spin" />
                        Queuing controlled action...
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
