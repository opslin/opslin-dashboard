"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clipboard, ExternalLink, Globe2, Loader2, LockKeyhole, Server, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlanGate } from "@/components/PlanGate";
import { UpgradePrompt as PlanUpgradePrompt } from "@/components/UpgradePrompt";
import type { App, DomainCheckResult, Server as OpslinServer } from "@/lib/api";

type AccessInfo = {
    url: string;
    label: string;
    scope: string;
    help: string;
};

type AppDomainSetupCardProps = {
    app: App;
    server: Pick<OpslinServer, "id" | "name" | "ip" | "publicIp" | "hostname">;
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
    disabled?: boolean;
};

function cleanDomain(value: string) {
    return value
        .trim()
        .replace(/^https?:\/\//i, "")
        .replace(/\/.*$/, "")
        .replace(/\.$/, "")
        .toLowerCase();
}

function isPrivateIPv4(value?: string | null) {
    if (!value) return false;
    const parts = value.split(".").map((part) => Number(part));
    if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;
    const [first, second] = parts;
    return first === 10 ||
        first === 127 ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168);
}

function hostHintForDomain(domain: string) {
    if (!domain) return "@ or subdomain";
    if (domain.startsWith("www.")) return "www";
    const labels = domain.split(".");
    return labels.length > 2 ? labels[0] : "@";
}

async function copyText(value: string, label: string) {
    if (!value) return;
    try {
        await navigator.clipboard.writeText(value);
        toast.success(`${label} copied`);
    } catch {
        toast.error("Could not copy to clipboard");
    }
}

export function AppDomainSetupCard({
    app,
    server,
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
    disabled = false,
}: AppDomainSetupCardProps) {
    const cleanedDomain = cleanDomain(domainValue);
    const hasDomain = Boolean(app.domain);
    const cleanedPublicIp = publicIpValue.trim();
    const serverAddress = server.publicIp || server.ip || server.hostname || "";
    const privateServerIp = isPrivateIPv4(server.ip);
    const dnsValue = privateServerIp
        ? server.publicIp || "Use the EC2 Public IPv4 or Elastic IP"
        : serverAddress || "Your server public IPv4";
    const dnsHost = hostHintForDomain(cleanedDomain || app.domain || "");
    const canOpenAccess = Boolean(access && access.scope !== "Private runtime port");
    const directAccess = app.port && server.publicIp ? `http://${server.publicIp}` : null;
    const ipPreviewReady = Boolean(!hasDomain && server.publicIp && app.port);

    return (
        <Card id="app-domain-ssl-card" className="overflow-hidden border-border/80 shadow-sm">
            <CardContent className="space-y-5 p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <Globe2 className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-base font-semibold text-foreground">Domain & SSL</h2>
                                <Badge variant={hasDomain ? "default" : ipPreviewReady ? "outline" : "secondary"} className="h-6">
                                    {hasDomain ? "Domain saved" : ipPreviewReady ? "IP preview active" : "Needs setup"}
                                </Badge>
                            </div>
                            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                                {ipPreviewReady
                                    ? "Opslin publishes this app through the managed edge route after deploy. Add a domain when you are ready for production HTTPS."
                                    : "Connect a production domain, point DNS to the server, and Opslin applies the public route automatically."}
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row lg:justify-end">
                        {access && canOpenAccess ? (
                            <Button id="app-open-current-url" asChild className="w-full sm:w-auto">
                                <a href={access.url} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="mr-2 h-4 w-4" />
                                    Open app
                                </a>
                            </Button>
                        ) : (
                            <Button id="app-open-current-url-disabled" variant="outline" disabled className="w-full sm:w-auto">
                                {access?.scope === "Private runtime port" ? "Private runtime port" : missingAccessAction}
                            </Button>
                        )}
                        <Button id="app-open-nginx-config" asChild variant="outline" className="w-full sm:w-auto">
                            <Link href={`/apps/${app.id}/nginx`}>
                                <Settings2 className="mr-2 h-4 w-4" />
                                Advanced Nginx
                            </Link>
                        </Button>
                    </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
                    <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Current access</p>
                        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                                <p className="truncate text-lg font-semibold text-foreground">
                                    {access ? access.label : missingAccessTitle}
                                </p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    {access ? access.help : missingAccessHelp}
                                </p>
                            </div>
                            {directAccess && !hasDomain && (
                                <Button
                                    id="app-copy-direct-access"
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => copyText(directAccess, "Server IP preview URL")}
                                    className="shrink-0"
                                >
                                    <Clipboard className="mr-2 h-4 w-4" />
                                    Copy preview URL
                                </Button>
                            )}
                        </div>
                    </div>

                    <PlanGate
                        feature="domains.customDomainMode"
                        fallback={
                            <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4">
                                <div className="flex items-start gap-3">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                                        <LockKeyhole className="h-4 w-4" />
                                    </div>
                                    <div className="space-y-2">
                                        <p className="text-sm font-medium">Custom domains require Starter+</p>
                                        <p className="text-sm text-muted-foreground">
                                            Direct port access still works for testing. Upgrade to connect a public domain and SSL.
                                        </p>
                                        <PlanUpgradePrompt feature="domains.customDomainMode" compact idPrefix="app-domain" />
                                    </div>
                                </div>
                            </div>
                        }
                    >
                        <div className="rounded-lg border border-border/70 bg-background p-4">
                            <Label htmlFor="app-domain-input">Production domain</Label>
                            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                                <Input
                                    id="app-domain-input"
                                    value={domainValue}
                                    onChange={(event) => onDomainChange(event.target.value)}
                                    placeholder="www.example.com"
                                    autoComplete="off"
                                    disabled={disabled}
                                />
                                <Button
                                    id="app-save-domain"
                                    type="button"
                                    onClick={() => onSaveDomain(cleanedDomain)}
                                    disabled={disabled || !cleanedDomain || isSavingDomain}
                                    className="sm:w-36"
                                >
                                    {isSavingDomain ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Saving
                                        </>
                                    ) : (
                                        "Connect & check"
                                    )}
                                </Button>
                            </div>
                            {domainCheck && (
                                <DomainCheckNotice result={domainCheck} />
                            )}
                            {hasDomain && (
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                    <Badge variant="outline" className="gap-1">
                                        <CheckCircle2 className="h-3.5 w-3.5 text-success-text" />
                                        {app.domain}
                                    </Badge>
                                    <Button
                                        id="app-remove-domain"
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => onSaveDomain(null)}
                                        disabled={disabled || isSavingDomain}
                                    >
                                        Remove domain
                                    </Button>
                                </div>
                            )}
                        </div>
                    </PlanGate>
                </div>

                <div className="rounded-lg border border-border/70 bg-background p-4">
                    <p className="text-sm font-semibold">Connection steps</p>
                    <div className="mt-3 grid gap-2 md:grid-cols-4">
                        <ConnectionStep
                            number="1"
                            title="Secure preview"
                            body={ipPreviewReady ? "Your app is available through the server IP route." : "Deploy once to create the managed IP preview route."}
                            done={ipPreviewReady}
                        />
                        <ConnectionStep
                            number="2"
                            title="DNS record"
                            body={`Create an A record for ${dnsHost} pointing to ${dnsValue}.`}
                            done={Boolean(hasDomain && domainCheck?.expectedIp)}
                        />
                        <ConnectionStep
                            number="3"
                            title="Opslin check"
                            body="Press Connect & check. Opslin saves the domain, applies the route, and verifies DNS."
                            done={domainCheck?.status === "ready"}
                        />
                        <ConnectionStep
                            number="4"
                            title="HTTPS ready"
                            body="After DNS is ready, open Advanced Nginx for SSL validation and certificate apply."
                            done={hasDomain && domainCheck?.status === "ready"}
                        />
                    </div>
                </div>

                <div className="grid gap-3 xl:grid-cols-3">
                    <div className="rounded-lg border border-border/70 bg-background p-4">
                        <div className="flex items-start gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-success-muted text-success-text">
                                <Server className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold">Recommended DNS record</p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Add this where your domain DNS is managed.
                                </p>
                                <div className="mt-3 space-y-2 text-sm">
                                    <DnsRow label="Type" value="A" />
                                    <DnsRow label="Name / Host" value={dnsHost} copyLabel="DNS host" />
                                    <DnsRow label="Value" value={dnsValue} copyLabel="DNS value" warning={privateServerIp && !server.publicIp} />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-lg border border-border/70 bg-background p-4">
                        <p className="text-sm font-semibold">Nameserver mode</p>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Opslin does not require changing nameservers. Only change nameservers if you move DNS to Cloudflare or Route 53; after that, create the same A record inside that provider.
                        </p>
                        <p className="mt-3 text-sm text-muted-foreground">
                            Do not paste the VPS IP into a nameserver field. Nameserver fields accept provider names like <span className="font-mono text-xs">ns1.example-dns.com</span>.
                        </p>
                        <p className="mt-3 text-sm text-muted-foreground">
                            For a subdomain, use CNAME only when the target is another public hostname. Use an A record when the target is an IP.
                        </p>
                    </div>

                    <div className="rounded-lg border border-border/70 bg-background p-4">
                        <p className="text-sm font-semibold">After DNS is added</p>
                        <ol className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                            <li>1. Save the domain in Opslin.</li>
                            <li>2. Wait until DNS resolves to the server public IP.</li>
                            <li>3. Opslin applies the Nginx route automatically.</li>
                            <li>4. Open the app URL and confirm the app loads.</li>
                        </ol>
                    </div>
                </div>

                {privateServerIp && !server.publicIp && (
                    <div className="space-y-3 rounded-lg border border-warning/30 bg-warning-muted p-3 text-sm text-warning-text">
                        <div className="flex gap-3">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                            <p>
                                This server is reporting private AWS IP <span className="font-mono">{server.ip}</span>. Public DNS and direct browser access need the EC2 public IPv4 or Elastic IP.
                            </p>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                            <div>
                                <Label htmlFor="app-public-ip-input" className="text-warning-text">
                                    Server public IPv4 / Elastic IP
                                </Label>
                                <Input
                                    id="app-public-ip-input"
                                    value={publicIpValue}
                                    onChange={(event) => onPublicIpChange(event.target.value)}
                                    placeholder="3.110.182.212"
                                    className="mt-1 bg-background"
                                    autoComplete="off"
                                    disabled={disabled}
                                />
                            </div>
                            <Button
                                id="app-save-public-ip"
                                type="button"
                                onClick={() => onSavePublicIp(cleanedPublicIp || null)}
                                disabled={disabled || !cleanedPublicIp || isSavingPublicIp}
                                className="self-end"
                            >
                                {isSavingPublicIp ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Saving
                                    </>
                                ) : (
                                    "Save public IP"
                                )}
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function DomainCheckNotice({ result }: { result: DomainCheckResult }) {
    const ready = result.status === "ready";
    const missingIp = result.status === "missing_public_ip";
    return (
        <div
            id="app-domain-dns-status"
            className={ready
                ? "mt-3 rounded-md border border-success/30 bg-success-muted p-3 text-sm text-success-text"
                : "mt-3 rounded-md border border-warning/30 bg-warning-muted p-3 text-sm text-warning-text"}
        >
            <div className="flex items-start gap-2">
                {ready ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
                <div>
                    <p className="font-medium">
                        {ready ? "DNS verified" : missingIp ? "Public IP required" : "DNS pending"}
                    </p>
                    <p className="mt-1">{result.message}</p>
                    {result.resolvedIps.length > 0 && (
                        <p className="mt-1 font-mono text-xs">Resolved: {result.resolvedIps.join(", ")}</p>
                    )}
                </div>
            </div>
        </div>
    );
}

function ConnectionStep({
    number,
    title,
    body,
    done,
}: {
    number: string;
    title: string;
    body: string;
    done: boolean;
}) {
    return (
        <div className="rounded-md border border-border/70 bg-muted/20 p-3">
            <div className="flex items-center gap-2">
                <span className={done
                    ? "flex h-6 w-6 items-center justify-center rounded-full bg-success text-xs font-semibold text-primary-foreground"
                    : "flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"}
                >
                    {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : number}
                </span>
                <p className="text-sm font-medium">{title}</p>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{body}</p>
        </div>
    );
}

function DnsRow({
    label,
    value,
    copyLabel,
    warning,
}: {
    label: string;
    value: string;
    copyLabel?: string;
    warning?: boolean;
}) {
    return (
        <div className="grid grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-2">
            <span className="text-muted-foreground">{label}</span>
            <span className={warning ? "truncate font-medium text-warning-text" : "truncate font-mono text-xs text-foreground"}>
                {value}
            </span>
            {copyLabel && !warning ? (
                <Button
                    id={`copy-${copyLabel.toLowerCase().replace(/\s+/g, "-")}`}
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => copyText(value, copyLabel)}
                >
                    <Clipboard className="h-3.5 w-3.5" />
                </Button>
            ) : (
                <span />
            )}
        </div>
    );
}
