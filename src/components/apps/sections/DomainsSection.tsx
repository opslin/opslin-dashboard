"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CardSkeleton } from "@/components/ui/card-skeleton";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { AppDomainSetupCard } from "@/components/apps/app-domain-setup-card";
import { CustomDomainsTable } from "@/components/apps/domains/CustomDomainsTable";
import { PreviewDomainCard } from "@/components/apps/domains/PreviewDomainCard";
import type { App, AppDomainRecord, AppDomainsResponse, DomainCheckResult, Server as OpslinServer } from "@/lib/api";

type AccessInfo = {
    url: string;
    label: string;
    scope: string;
    help: string;
};

type DomainsSectionProps = {
    app: App;
    server: Pick<OpslinServer, "id" | "name" | "ip" | "publicIp" | "hostname">;
    appId: string;
    domainData?: AppDomainsResponse;
    domainsLoading: boolean;
    access: AccessInfo | null;
    missingAccessTitle: string;
    missingAccessHelp: string;
    missingAccessAction: string;
    domainValue: string;
    onDomainChange: (value: string) => void;
    onSaveDomain: (domain: string | null) => void;
    isSavingDomain: boolean;
    publicIpValue: string;
    onPublicIpChange: (value: string) => void;
    onSavePublicIp: (publicIp: string | null) => void;
    isSavingPublicIp: boolean;
    domainCheck?: DomainCheckResult | null;
    deleteLocked: boolean;
};

function stripPort(host: string) {
    if (host.startsWith("[") && host.includes("]")) {
        return host.slice(1, host.indexOf("]"));
    }
    return host.split(":")[0];
}

function isRawIpHost(host?: string | null) {
    if (!host) {
        return false;
    }

    const normalized = stripPort(host.trim().toLowerCase());
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(normalized)) {
        return normalized.split(".").every((part) => {
            const value = Number(part);
            return Number.isInteger(value) && value >= 0 && value <= 255;
        });
    }

    return /^[0-9a-f:]+$/i.test(normalized) && normalized.includes(":");
}

function urlHost(value?: string | null) {
    if (!value) {
        return null;
    }
    try {
        return new URL(value).hostname;
    } catch {
        return value.replace(/^https?:\/\//i, "").split("/")[0];
    }
}

function safeUrl(value?: string | null) {
    return value && !isRawIpHost(urlHost(value)) ? value : undefined;
}

function visibleDomainRecords(domains: AppDomainRecord[]) {
    return domains
        .filter((domain) => !isRawIpHost(domain.domain))
        .map((domain) => ({
            ...domain,
            httpUrl: safeUrl(domain.httpUrl),
            httpsUrl: safeUrl(domain.httpsUrl),
            preferredUrl: safeUrl(domain.preferredUrl),
        }));
}

export function DomainsSection({
    app,
    server,
    appId,
    domainData,
    domainsLoading,
    access,
    missingAccessTitle,
    missingAccessHelp,
    missingAccessAction,
    domainValue,
    onDomainChange,
    onSaveDomain,
    isSavingDomain,
    publicIpValue,
    onPublicIpChange,
    onSavePublicIp,
    isSavingPublicIp,
    domainCheck,
    deleteLocked,
}: DomainsSectionProps) {
    if (deleteLocked) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Domain changes paused</CardTitle>
                    <CardDescription>
                        Domain mutations are disabled while delete cleanup is pending or retryable.
                    </CardDescription>
                </CardHeader>
            </Card>
        );
    }

    if (domainsLoading) {
        return (
            <div className="space-y-6">
                <CardSkeleton count={1} />
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Custom Domains</CardTitle>
                        <CardDescription>Loading domain records...</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <TableSkeleton rows={3} cols={6} />
                    </CardContent>
                </Card>
            </div>
        );
    }

    const domains = visibleDomainRecords(domainData?.domains ?? []);
    const previewDomain = domains.find((domain) => domain.type === "preview" && domain.enabled) ??
        domains.find((domain) => domain.type === "preview") ??
        null;
    const hasConnectedCustomDomain = domains.some((domain) =>
        domain.type === "custom" &&
        domain.enabled &&
        (domain.status === "connected" || domain.status === "active")
    );

    return (
        <section className="space-y-6">
            <AppDomainSetupCard
                app={app}
                server={server}
                access={access}
                missingAccessTitle={missingAccessTitle}
                missingAccessHelp={missingAccessHelp}
                missingAccessAction={missingAccessAction}
                domainValue={domainValue}
                onDomainChange={onDomainChange}
                onSaveDomain={onSaveDomain}
                isSavingDomain={isSavingDomain}
                publicIpValue={publicIpValue}
                onPublicIpChange={onPublicIpChange}
                onSavePublicIp={onSavePublicIp}
                isSavingPublicIp={isSavingPublicIp}
                domainCheck={domainCheck}
            />
            <PreviewDomainCard appId={appId} appStatus={app.status} domain={previewDomain} secondary={hasConnectedCustomDomain} />
            <CustomDomainsTable appId={appId} domains={domains} />
        </section>
    );
}
