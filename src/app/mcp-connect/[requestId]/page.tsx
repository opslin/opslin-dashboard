"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bot, Eye, Pencil, Rocket, ShieldCheck } from "lucide-react";
import { api, ApiRequestError } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { toast } from "sonner";

const SCOPE_LABELS: Record<string, { label: string; icon: typeof Eye }> = {
    "apps:read": { label: "View your apps", icon: Eye },
    "apps:write": { label: "Edit app settings & environment variables", icon: Pencil },
    "apps.deploy:write": { label: "Deploy & roll back apps", icon: Rocket },
    "databases:read": { label: "View your databases", icon: Eye },
    "databases:write": { label: "Create, connect & manage databases", icon: Pencil },
    "backups:read": { label: "View backups", icon: Eye },
    "backups:write": { label: "Create backups", icon: Pencil },
    "backups.restore:write": { label: "Restore backups", icon: Pencil },
    "servers:read": { label: "View servers", icon: Eye },
    "servers:write": { label: "Manage server firewall rules", icon: Pencil },
};

export default function McpConnectPage() {
    const params = useParams();
    const requestId = params.requestId as string;
    const { user, loading } = useAuth();

    const { data, isLoading, isError } = useQuery({
        queryKey: ["mcp-connect-request", requestId],
        queryFn: () => api.getMcpConnectRequest(requestId),
        enabled: Boolean(requestId),
        retry: false,
    });

    const approveMutation = useMutation({
        mutationFn: () => api.approveMcpConnectRequest(requestId),
        onSuccess: (result) => {
            window.location.href = result.redirectTo;
        },
        onError: (error) => {
            if (!(error instanceof ApiRequestError && error.details.code === "feature_not_available")) {
                toast.error(error instanceof Error ? error.message : "Failed to approve connection");
            }
        },
    });

    const denyMutation = useMutation({
        mutationFn: () => api.denyMcpConnectRequest(requestId),
        onSuccess: (result) => {
            window.location.href = result.redirectTo;
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : "Failed to decline connection");
        },
    });

    const planBlocked = approveMutation.error instanceof ApiRequestError && approveMutation.error.details.code === "feature_not_available";

    return (
        <AuthCard
            title="Connect an AI tool"
            description="An AI coding tool wants to access your Opslin account"
            icon={Bot}
            maxWidthClassName="max-w-xl"
        >
            {isLoading && <p className="text-sm text-muted-foreground">Loading request…</p>}
            {isError && (
                <p className="text-sm text-danger-text">
                    This connection request is invalid or has expired — go back to your AI tool and try connecting again.
                </p>
            )}
            {data && (
                <>
                    <div className="rounded-xl border border-border bg-card p-4">
                        <p className="font-medium text-foreground">{data.clientName}</p>
                        <p className="mt-1 text-sm text-muted-foreground">wants permission to:</p>
                        <ul className="mt-3 space-y-2">
                            {data.scopes.map((scope) => {
                                const info = SCOPE_LABELS[scope] ?? { label: scope, icon: Eye };
                                const Icon = info.icon;
                                return (
                                    <li key={scope} className="flex items-center gap-2 text-sm text-foreground">
                                        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                                        {info.label}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>

                    {!loading && !user && (
                        <div className="flex flex-wrap gap-3">
                            <Button asChild>
                                <Link href={`/login?next=${encodeURIComponent(`/mcp-connect/${requestId}`)}`}>
                                    Sign in to continue
                                </Link>
                            </Button>
                        </div>
                    )}

                    {!loading && user && planBlocked && (
                        <div className="space-y-3">
                            <p className="text-sm text-muted-foreground">
                                Connecting AI tools requires a Starter plan or above.
                            </p>
                            <UpgradePrompt feature="mcp.access" />
                        </div>
                    )}

                    {!loading && user && !planBlocked && (
                        <div className="space-y-3">
                            <p className="text-sm text-muted-foreground">
                                Signed in as <strong>{user.email}</strong>
                            </p>
                            <div className="flex gap-3">
                                <Button
                                    onClick={() => approveMutation.mutate()}
                                    disabled={approveMutation.isPending || denyMutation.isPending}
                                    className="transition-transform duration-150 active:scale-[0.98]"
                                >
                                    {approveMutation.isPending ? "Connecting…" : "Allow"}
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => denyMutation.mutate()}
                                    disabled={approveMutation.isPending || denyMutation.isPending}
                                >
                                    Deny
                                </Button>
                            </div>
                            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <ShieldCheck className="h-3.5 w-3.5" />
                                Only the permissions listed above are granted.
                            </p>
                        </div>
                    )}
                </>
            )}
        </AuthCard>
    );
}
