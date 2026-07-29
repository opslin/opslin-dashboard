"use client";

import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { App, AppDomainsResponse } from "@/lib/api";
import { appDomainUrl, resolveVisibleDomain } from "./app-helpers";

type AppPrimaryUrlCardProps = {
    app?: Pick<App, "status" | "port">;
    domainData?: AppDomainsResponse;
    domainsLoading: boolean;
};

export function AppPrimaryUrlCard({
    app,
    domainData,
    domainsLoading,
}: AppPrimaryUrlCardProps) {
    const visibleDomain = resolveVisibleDomain(domainData);

    const handleCopy = async (url: string) => {
        await navigator.clipboard.writeText(url);
        toast.success("Copied!", { duration: 2000 });
    };

    if (domainsLoading) {
        return (
            <div className="h-14 rounded-xl border bg-card p-4">
                <div className="h-4 w-full max-w-md animate-pulse rounded bg-muted" />
            </div>
        );
    }

    if (!visibleDomain) {
        return (
            <div className="rounded-xl border border-dashed bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                No URL available yet
            </div>
        );
    }

    const url = appDomainUrl(visibleDomain.domain);
    if (!url) {
        return (
            <div className="rounded-xl border border-dashed bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                No URL available yet
            </div>
        );
    }

    const sslReady = visibleDomain.domain.sslStatus === "active";
    const hasActiveSsl = Boolean(domainData?.domains.some((domain) => domain.enabled && domain.sslStatus === "active"));
    const appHasRunningPort = app?.status === "running" && Number(app.port ?? 0) > 0;
    const httpLive = appHasRunningPort && !hasActiveSsl;

    return (
        <div className="flex flex-col gap-3 rounded-xl border border-info/30 bg-info-muted/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-info-text">
                    {visibleDomain.label}
                </p>
                <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 block truncate font-mono text-sm font-semibold text-foreground hover:underline"
                >
                    {url}
                </a>
                <div className="mt-2 flex flex-wrap gap-2">
                    {sslReady ? (
                        <Badge className="bg-success-muted text-success-text">
                            HTTPS Live
                        </Badge>
                    ) : httpLive ? (
                        <>
                            <Badge className="bg-success-muted text-success-text">
                                HTTP Live
                            </Badge>
                            <Badge className="bg-warning-muted text-warning-text">
                                HTTPS Not Ready
                            </Badge>
                        </>
                    ) : (
                        <Badge className="bg-warning-muted text-warning-text">
                            HTTPS Not Ready
                        </Badge>
                    )}
                </div>
                {httpLive ? (
                    <p className="mt-1 text-xs text-info/80">
                        Your app is accessible over HTTP. HTTPS will be available after SSL setup.
                    </p>
                ) : null}
            </div>
            <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" onClick={() => handleCopy(url)}>
                    <Copy className="h-4 w-4" />
                    Copy
                </Button>
                <Button asChild size="sm">
                    <a href={url} target="_blank" rel="noopener noreferrer">
                        {sslReady ? "Open HTTPS" : "Open HTTP"}
                        <ExternalLink className="h-4 w-4" />
                    </a>
                </Button>
            </div>
        </div>
    );
}
