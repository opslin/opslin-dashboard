"use client";

import type { ReactNode } from "react";
import {
    AlertTriangle,
    CheckCircle2,
    Clock3,
    ExternalLink,
    Loader2,
    MinusCircle,
    RotateCw,
    ShieldCheck,
    XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/utils";
import type { AppDomainRecord, AppDomainSslStatus } from "@/lib/api";

type DomainStatusDetailProps = {
    domain: AppDomainRecord;
    retrying?: boolean;
    onRetrySsl?: () => void;
};

type StepState = "complete" | "progress" | "failed" | "waiting";

function formatConnectedDate(value: string | null) {
    if (!value) return null;
    return new Intl.DateTimeFormat("en", {
        month: "long",
        day: "numeric",
        year: "numeric",
    }).format(new Date(value));
}

function normalizeSslStatus(value: AppDomainSslStatus): Exclude<AppDomainSslStatus, null> {
    if (!value) return "not_started";
    if (value === "manual_required") return "not_configured";
    return value;
}

function accessUrl(domain: AppDomainRecord) {
    if (domain.sslStatus === "active") {
        return domain.httpsUrl || `https://${domain.domain}`;
    }
    return domain.httpUrl || `http://${domain.domain}`;
}

function dnsStatus(domain: AppDomainRecord) {
    switch (domain.status) {
        case "active":
        case "connected":
            return { label: "Connected", icon: "✅" };
        case "misconfigured":
            return { label: "Misconfigured", icon: "❌" };
        case "failed":
            return { label: "Failed", icon: "❌" };
        case "disabled":
            return { label: "Disabled", icon: "—" };
        default:
            return { label: "Waiting", icon: "⏳" };
    }
}

function httpStatus(domain: AppDomainRecord) {
    if (domain.routeStatus === "failed") {
        return { label: "Route failed", icon: "❌" };
    }
    if (domain.routeStatus === "active") {
        return { label: "Route active", icon: "✅" };
    }
    switch (domain.status) {
        case "active":
        case "connected":
            return { label: "Route active", icon: "✅" };
        case "misconfigured":
            return { label: "Route blocked by DNS", icon: "❌" };
        case "failed":
            return { label: "Failed", icon: "❌" };
        case "disabled":
            return { label: "Disabled", icon: "—" };
        default:
            return { label: "Route pending", icon: "⏳" };
    }
}

function sslStatus(domain: AppDomainRecord) {
    const normalized = normalizeSslStatus(domain.sslStatus);
    switch (normalized) {
        case "active":
            return { label: "Active", icon: "✅", detail: "HTTPS is ready." };
        case "pending":
            return { label: "Pending", icon: "⏳", detail: "Let’s Encrypt certificate issuance is in progress." };
        case "failed":
            return { label: "Failed", icon: "❌", detail: domain.errorMessage || "SSL setup failed." };
        case "not_configured":
            return {
                label: "Not configured",
                icon: "⚠️",
                detail: domain.errorMessage || "SSL cannot start because Let’s Encrypt is not configured.",
            };
        default:
            return { label: "Not started", icon: "⬜", detail: "SSL will start after DNS is connected." };
    }
}

function httpsStatus(domain: AppDomainRecord) {
    return domain.sslStatus === "active"
        ? { label: "Ready", icon: "✅" }
        : { label: "Not ready", icon: "⬜" };
}

function stepLabel(state: StepState) {
    switch (state) {
        case "complete":
            return { icon: "✅", label: "Complete" };
        case "progress":
            return { icon: "⏳", label: "In progress" };
        case "failed":
            return { icon: "❌", label: "Failed" };
        case "waiting":
            return { icon: "⬜", label: "Waiting" };
    }
}

function buildSteps(domain: AppDomainRecord): Array<{ label: string; state: StepState }> {
    const dnsConnected = domain.status === "connected" || domain.status === "active";
    const dnsFailed = domain.status === "misconfigured" || domain.status === "failed";
    const ssl = normalizeSslStatus(domain.sslStatus);
    const routeStatus = domain.routeStatus ?? (dnsConnected ? "active" : "pending");

    return [
        {
            label: "DNS record",
            state: domain.status === "pending_dns" ? "waiting" : (dnsFailed ? "failed" : "complete"),
        },
        {
            label: "DNS verified",
            state: dnsConnected ? "complete" : (dnsFailed ? "failed" : "waiting"),
        },
        {
            label: "HTTP route active",
            state: routeStatus === "active"
                ? "complete"
                : routeStatus === "failed"
                    ? "failed"
                    : (dnsFailed ? "failed" : "waiting"),
        },
        {
            label: "SSL certificate",
            state: ssl === "active" ? "complete" : (ssl === "pending" ? "progress" : (ssl === "failed" || ssl === "not_configured" ? "failed" : "waiting")),
        },
        {
            label: "HTTPS ready",
            state: ssl === "active" ? "complete" : (ssl === "failed" || ssl === "not_configured" ? "failed" : "waiting"),
        },
    ];
}

function canRetrySsl(domain: AppDomainRecord) {
    if (!domain.enabled || domain.sslStatus === "active") {
        return false;
    }
    return Boolean(domain.canRetrySsl);
}

function IpLine({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
            <span className="text-muted-foreground">{label}</span>
            <code className="w-fit rounded-md bg-background px-2 py-1 font-mono text-xs text-foreground">
                {value}
            </code>
        </div>
    );
}

export function DomainStatusDetail({ domain, retrying = false, onRetrySsl }: DomainStatusDetailProps) {
    const lastChecked = domain.lastCheckedAt ? formatRelativeTime(domain.lastCheckedAt) : null;
    const dns = dnsStatus(domain);
    const http = httpStatus(domain);
    const ssl = sslStatus(domain);
    const https = httpsStatus(domain);
    const connectedSince = formatConnectedDate(domain.connectedAt);
    const retryAllowed = canRetrySsl(domain) && onRetrySsl;
    const url = accessUrl(domain);
    const sslActive = domain.sslStatus === "active";

    return (
        <StatusPanel
            icon={sslActive ? <ShieldCheck className="h-4 w-4" /> : statusIcon(domain.status)}
            tone={panelTone(domain)}
            title={statusTitle(domain)}
            lastChecked={lastChecked}
        >
            <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
                <StatusLine label="Current Access" value={domain.domain} />
                <StatusLine label="DNS Status" value={`${dns.icon} ${dns.label}`} />
                <StatusLine label="HTTP Status" value={`${http.icon} ${http.label}`} />
                <StatusLine label="SSL Status" value={`${ssl.icon} ${ssl.label}`} />
                <StatusLine label="HTTPS Status" value={`${https.icon} ${https.label}`} />
            </div>

            <div className="rounded-lg border bg-background/70 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Connection steps
                </p>
                <div className="grid gap-2 sm:grid-cols-5">
                    {buildSteps(domain).map((step, index) => {
                        const state = stepLabel(step.state);
                        return (
                            <div key={step.label} className="rounded-md border bg-card p-2">
                                <p className="text-xs font-semibold text-foreground">{index + 1}. {step.label}</p>
                                <p className="mt-1 text-xs text-muted-foreground">{state.icon} {state.label}</p>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="space-y-2">
                <p>{ssl.detail}</p>
                {domain.sslStatus === "active" ? (
                    <p>Open URL uses HTTPS because SSL is active.</p>
                ) : (
                    <p>HTTP is available now when DNS is connected. HTTPS will appear after SSL is active.</p>
                )}
                {normalizeSslStatus(domain.sslStatus) === "not_configured" ? (
                    <p>Admin configuration required: set LETSENCRYPT_ENABLED=true and LETSENCRYPT_EMAIL on the API.</p>
                ) : null}
                {domain.sslFailureAction ? <p>{domain.sslFailureAction}</p> : null}
                {domain.readinessWarning ? <p>{domain.readinessWarning}</p> : null}
                {connectedSince ? <p>Connected since: {connectedSince}</p> : null}
                {domain.status === "pending_dns" ? (
                    <>
                        <p>{domain.errorMessage || "Add the A record shown above, then click Check Connection."}</p>
                        <p>Opslin also rechecks automatically.</p>
                    </>
                ) : null}
                {domain.status === "misconfigured" ? (
                    <div className="space-y-2">
                        {domain.expectedIp ? <IpLine label="Expected IP:" value={domain.expectedIp} /> : null}
                        {domain.resolvedIps?.length ? (
                            <IpLine label="Resolved to:" value={domain.resolvedIps.join(", ")} />
                        ) : null}
                        <p>{domain.errorMessage || "Update your A record to point to the expected IP."}</p>
                    </div>
                ) : null}
                {domain.status === "failed" ? (
                    <>
                        <p>{domain.errorMessage || "An error occurred during setup."}</p>
                        <p>Please try again or contact support if this continues.</p>
                    </>
                ) : null}
                {domain.status === "disabled" ? <p>This domain is currently disabled.</p> : null}
            </div>

            <div className="flex flex-wrap gap-2">
                {retryAllowed ? (
                    <Button variant="outline" size="sm" onClick={onRetrySsl} disabled={retrying}>
                        {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
                        Retry SSL
                    </Button>
                ) : null}
                <Button asChild variant={sslActive ? "default" : "outline"} size="sm">
                    <a href={url} target="_blank" rel="noopener noreferrer">
                        {sslActive ? "Open HTTPS" : "Open HTTP"}
                        <ExternalLink className="h-4 w-4" />
                    </a>
                </Button>
            </div>
        </StatusPanel>
    );
}

function StatusLine({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
            <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
        </div>
    );
}

function statusIcon(status: AppDomainRecord["status"]) {
    switch (status) {
        case "active":
        case "connected":
            return <CheckCircle2 className="h-4 w-4" />;
        case "pending_dns":
            return <Clock3 className="h-4 w-4" />;
        case "misconfigured":
            return <AlertTriangle className="h-4 w-4" />;
        case "failed":
            return <XCircle className="h-4 w-4" />;
        case "disabled":
            return <MinusCircle className="h-4 w-4" />;
        default:
            return <Clock3 className="h-4 w-4" />;
    }
}

function statusTitle(domain: AppDomainRecord) {
    if (domain.status === "active" && domain.sslStatus === "active") {
        return "Your domain is live over HTTPS.";
    }
    if ((domain.status === "connected" || domain.status === "active") && domain.sslStatus !== "active") {
        return "DNS is connected. SSL is not ready yet.";
    }
    if (domain.status === "pending_dns") {
        return "Waiting for DNS record.";
    }
    if (domain.status === "misconfigured") {
        return "This domain points to a different IP.";
    }
    if (domain.status === "failed") {
        return "Domain setup failed.";
    }
    if (domain.status === "disabled") {
        return "This domain is currently disabled.";
    }
    return "Domain setup is in progress.";
}

function panelTone(domain: AppDomainRecord) {
    if (domain.status === "active" && domain.sslStatus === "active") return "emerald";
    if (domain.status === "connected" || domain.status === "active") return "blue";
    if (domain.status === "pending_dns") return "amber";
    if (domain.status === "misconfigured") return "orange";
    if (domain.status === "failed") return "red";
    return "slate";
}

function StatusPanel({
    children,
    icon,
    lastChecked,
    title,
    tone,
}: {
    children?: ReactNode;
    icon: ReactNode;
    lastChecked: string | null;
    title: string;
    tone: "amber" | "orange" | "blue" | "emerald" | "red" | "slate";
}) {
    const toneClass = {
        amber: "border-warning/30 bg-warning-muted text-foreground",
        orange: "border-warning/30 bg-warning-muted text-foreground",
        blue: "border-info/30 bg-info-muted text-foreground",
        emerald: "border-success/30 bg-success-muted text-foreground",
        red: "border-danger/30 bg-danger-muted text-foreground",
        slate: "border-border bg-muted/40 text-foreground",
    }[tone];

    return (
        <div className={`rounded-xl border p-4 text-sm ${toneClass}`}>
            <div className="flex gap-3">
                <span className="mt-0.5 shrink-0" aria-hidden="true">
                    {icon}
                </span>
                <div className="min-w-0 flex-1 space-y-4">
                    <div>
                        <p className="font-semibold">{title}</p>
                        {lastChecked ? (
                            <p className="mt-1 text-sm text-muted-foreground">Last checked: {lastChecked}</p>
                        ) : null}
                    </div>
                    {children ? <div className="space-y-4 text-muted-foreground">{children}</div> : null}
                </div>
            </div>
        </div>
    );
}
