"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Globe2, Loader2, PauseCircle, Plus, RotateCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, type App, type AppDomainRecord } from "@/lib/api";
import { DomainStatusBadge } from "./DomainStatusBadge";
import { DomainStatusDetail } from "./DomainStatusDetail";

type PreviewDomainCardProps = {
    appId: string;
    appStatus?: App["status"];
    domain: AppDomainRecord | null;
    secondary?: boolean;
};

async function copyUrl(url: string) {
    await navigator.clipboard.writeText(url);
    toast.success("Copied!", { duration: 2000 });
}

function domainUrl(domain: AppDomainRecord) {
    return domain.preferredUrl || `${domain.sslStatus === "active" ? "https" : "http"}://${domain.domain}`;
}

function canRetrySsl(domain: AppDomainRecord) {
    if (!domain.enabled || domain.sslStatus === "active") {
        return false;
    }
    return Boolean(domain.canRetrySsl ?? (domain.status === "connected" || domain.status === "active"));
}

export function PreviewDomainCard({ appId, appStatus, domain, secondary = false }: PreviewDomainCardProps) {
    const queryClient = useQueryClient();
    const createPreviewMutation = useMutation({
        mutationFn: () => api.createPreviewDomain(appId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["app-domains", appId] });
            toast.success("Temporary URL created");
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : "Failed to create temporary URL");
        },
    });
    const disablePreviewMutation = useMutation({
        mutationFn: (domainId: string) => api.disableAppDomain(appId, domainId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["app-domains", appId] });
            toast.success("Temporary URL disabled");
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : "Failed to disable temporary URL");
        },
    });
    const deletePreviewMutation = useMutation({
        mutationFn: (domainId: string) => api.removeAppDomain(appId, domainId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["app-domains", appId] });
            toast.success("Temporary URL removed");
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : "Failed to remove temporary URL");
        },
    });
    const regeneratePreviewMutation = useMutation({
        mutationFn: () => api.regeneratePreviewDomain(appId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["app-domains", appId] });
            toast.success("Temporary URL regenerated");
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : "Failed to regenerate temporary URL");
        },
    });
    const retrySslMutation = useMutation({
        mutationFn: (domainId: string) => api.retryDomainSsl(appId, domainId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["app-domains", appId] });
            toast.success("SSL retry started");
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : "Failed to retry SSL");
        },
    });

    if (!domain) {
        return (
            <Card className="overflow-hidden border-dashed">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <Globe2 className="h-5 w-5 text-muted-foreground" />
                        Temporary Opslin URL
                    </CardTitle>
                    <CardDescription>
                        Create a preview URL that works before your own domain is connected.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-muted-foreground">Temporary URL not created yet.</p>
                    <Button
                        onClick={() => createPreviewMutation.mutate()}
                        disabled={createPreviewMutation.isPending}
                    >
                        {createPreviewMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Plus className="h-4 w-4" />
                        )}
                        Create Temporary URL
                    </Button>
                </CardContent>
            </Card>
        );
    }

    const disabled = !domain.enabled || domain.status === "disabled";
    const url = domainUrl(domain);
    const sslReady = domain.sslStatus === "active";
    const appRunning = appStatus === "running";
    const busy = disablePreviewMutation.isPending ||
        deletePreviewMutation.isPending ||
        regeneratePreviewMutation.isPending ||
        retrySslMutation.isPending;

    return (
        <Card className={secondary
            ? "overflow-hidden border-dashed bg-muted/30"
            : "overflow-hidden border-info/30 bg-info-muted/40 shadow-sm"}
        >
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                        <Globe2 className="h-5 w-5" />
                    </span>
                    {secondary ? "Temporary URL fallback" : "Temporary Opslin URL"}
                </CardTitle>
                <CardDescription>
                    {secondary
                        ? "Your custom domain is primary. Keep this as a fallback or remove it from domain actions."
                        : "This URL works even before you connect your own domain."}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                <div className="flex flex-col gap-3 rounded-xl border bg-card/75 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                    {disabled ? (
                        <p className="text-sm font-medium text-muted-foreground">Temporary URL is disabled.</p>
                    ) : (
                        <>
                            <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="break-all font-mono text-sm font-semibold text-info-text hover:underline"
                            >
                                {url}
                            </a>
                            <Button variant="outline" size="sm" onClick={() => copyUrl(url)}>
                                <Copy className="h-4 w-4" />
                                Copy
                            </Button>
                        </>
                    )}
                </div>
                {!disabled && !sslReady ? (
                    <p className="text-sm text-muted-foreground">
                        HTTP is available now. HTTPS will be used after SSL is active.
                    </p>
                ) : null}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                            Status
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <DomainStatusBadge status={domain.status} />
                            {appRunning ? (
                                <Badge className="bg-info-muted text-info-text border border-info/30">
                                    HTTP
                                </Badge>
                            ) : null}
                            {sslReady ? (
                                <Badge className="bg-info-muted text-info-text border border-info/30">
                                    HTTPS
                                </Badge>
                            ) : null}
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {!disabled ? (
                            <>
                                <Button asChild>
                                    <a href={url} target="_blank" rel="noopener noreferrer">
                                        {sslReady ? "Open HTTPS" : "Open HTTP"}
                                        <ExternalLink className="h-4 w-4" />
                                    </a>
                                </Button>
                                {canRetrySsl(domain) ? (
                                    <Button
                                        variant="outline"
                                        disabled={busy}
                                        onClick={() => retrySslMutation.mutate(domain.id)}
                                    >
                                        {retrySslMutation.isPending ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <RotateCw className="h-4 w-4" />
                                        )}
                                        Retry SSL
                                    </Button>
                                ) : null}
                                <Button
                                    variant="outline"
                                    disabled={busy}
                                    onClick={() => {
                                        if (confirm("Disable this temporary URL?")) {
                                            disablePreviewMutation.mutate(domain.id);
                                        }
                                    }}
                                >
                                    <PauseCircle className="h-4 w-4" />
                                    Disable
                                </Button>
                                <Button
                                    variant="destructive"
                                    disabled={busy}
                                    onClick={() => {
                                        if (confirm("Remove this temporary URL and Cloudflare record?")) {
                                            deletePreviewMutation.mutate(domain.id);
                                        }
                                    }}
                                >
                                    <Trash2 className="h-4 w-4" />
                                    Delete
                                </Button>
                            </>
                        ) : null}
                        <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() => regeneratePreviewMutation.mutate()}
                        >
                            {regeneratePreviewMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <RotateCw className="h-4 w-4" />
                            )}
                            Regenerate
                        </Button>
                    </div>
                </div>
                {!disabled ? (
                    <DomainStatusDetail
                        domain={domain}
                        retrying={retrySslMutation.isPending}
                        onRetrySsl={canRetrySsl(domain) ? () => retrySslMutation.mutate(domain.id) : undefined}
                    />
                ) : null}
            </CardContent>
        </Card>
    );
}
