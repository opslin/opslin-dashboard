"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, ChevronDown, Copy, ExternalLink, Globe, Loader2, MoreHorizontal, Plus, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { AppDomainSetupCard } from "@/components/apps/app-domain-setup-card";
import { DomainDeleteDialog } from "@/components/apps/domains/DomainDeleteDialog";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CardSkeleton } from "@/components/ui/card-skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { api, type App, type AppDomainRecord, type AppDomainsResponse, type DnsInstruction, type DomainCheckResult, type Server as OpslinServer } from "@/lib/api";
import { cn } from "@/lib/utils";

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


function sanitizeDomain(input: string) {
    return input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\.+$/, "");
}

function validateDomain(input: string): string | null {
    const domain = sanitizeDomain(input);
    if (!domain) return "Type your domain first";
    if (/[/?#]/.test(domain)) return "Enter the domain only, like shop.example.com";
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(domain)) return "IP addresses are not supported";
    if (!domain.includes(".")) return "That doesn't look like a domain (try shop.example.com)";
    return null;
}

function dnsRecordName(domain: string) {
    const labels = domain.toLowerCase().split(".").filter(Boolean);
    return labels.length <= 2 ? "@" : labels.slice(0, -2).join(".");
}

function dnsFor(domain: AppDomainRecord): DnsInstruction {
    return { type: "A", name: dnsRecordName(domain.domain), value: domain.expectedIp || "Not configured", ttl: "Auto" };
}

type Pill = { label: string; tone: "neutral" | "success" | "warning" | "danger" };

function pillFor(domain: AppDomainRecord): Pill {
    if (domain.type === "preview") return domain.enabled ? { label: "Default", tone: "neutral" } : { label: "Disabled", tone: "neutral" };
    if (!domain.enabled || domain.status === "disabled") return { label: "Disabled", tone: "neutral" };
    if (domain.status === "active" && domain.sslStatus === "active") return { label: "Active · HTTPS", tone: "success" };
    if (domain.status === "failed") return { label: "Failed", tone: "danger" };
    return { label: "Verifying…", tone: "warning" };
}

function subtitleFor(domain: AppDomainRecord) {
    if (domain.type === "preview") return "Your Opslin address";
    if (domain.status === "active" && domain.sslStatus === "active") return "SSL certificate active";
    if (domain.status === "failed") return domain.errorMessage || "Something went wrong. Check the DNS record.";
    if (domain.status === "connected" || domain.status === "ssl_pending" || domain.status === "active") return "DNS is correct. Issuing your certificate.";
    return null;
}

const PILL_CLASS = {
    neutral: "bg-muted text-muted-foreground",
    success: "bg-success-muted text-success-text",
    warning: "bg-warning-muted text-warning-text",
    danger: "bg-danger-muted text-danger-text",
} as const;
const PILL_DOT = { neutral: "bg-muted-foreground", success: "bg-success", warning: "bg-warning", danger: "bg-danger" } as const;

function canRetrySsl(domain: AppDomainRecord) {
    if (!domain.enabled || domain.sslStatus === "active") return false;
    return Boolean(domain.canRetrySsl ?? (domain.status === "connected" || domain.status === "active"));
}

function domainOpenUrl(domain: AppDomainRecord) {
    return domain.preferredUrl || `${domain.sslStatus === "active" ? "https" : "http"}://${domain.domain}`;
}

async function copyText(value: string, label: string) {
    try {
        await navigator.clipboard.writeText(value);
        toast.success(`${label} copied`);
    } catch {
        toast.error("Couldn't copy");
    }
}

function CopyButton({ value, label }: { value: string; label: string }) {
    return (
        <button type="button" aria-label={`Copy ${label}`} onClick={() => void copyText(value, label)} className="rounded p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
            <Copy className="size-3.5" aria-hidden="true" />
        </button>
    );
}

type PanelState = { mode: "add" } | { mode: "finish"; domain: AppDomainRecord; dns: DnsInstruction } | null;

function AddDomainPanel({ appId, state, onClose, onChange }: { appId: string; state: NonNullable<PanelState>; onClose: () => void; onChange: (next: PanelState) => void }) {
    const queryClient = useQueryClient();
    const [input, setInput] = useState("");
    const [error, setError] = useState<string | null>(null);
    const refresh = () => queryClient.invalidateQueries({ queryKey: ["app-domains", appId] });

    const add = useMutation({
        mutationFn: (domain: string) => api.addCustomDomain(appId, domain),
        onSuccess: (result) => {
            void refresh();
            toast.success("Domain added. Now add the DNS record.");
            onChange({ mode: "finish", domain: result.domain, dns: result.dnsInstructions });
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't add the domain"),
    });
    const check = useMutation({
        mutationFn: (domainId: string) => api.checkAppDomain(appId, domainId),
        onSuccess: (result) => {
            void refresh();
            if (result.status === "active" || result.status === "connected") {
                toast.success("Your domain is connected");
                onClose();
            } else {
                toast.message(result.message || "Not ready yet. DNS can take a few minutes.");
            }
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Check failed. Please try again."),
    });

    const finishing = state.mode === "finish";
    const domainName = finishing ? state.domain.domain : sanitizeDomain(input);

    return (
        <Card className="gap-0 rounded-2xl py-0 shadow-xs">
            <div className="flex items-start justify-between px-6 pt-5">
                <div>
                    <h2 className="text-xl font-bold tracking-tight text-foreground">{finishing ? `Finish ${state.domain.domain}` : "Add your domain"}</h2>
                    <p className="text-sm text-muted-foreground">{finishing ? "One more step at your domain provider." : "Connect a domain you already own."}</p>
                </div>
                <button type="button" aria-label="Close" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"><X className="size-5" aria-hidden="true" /></button>
            </div>
            <ol className="space-y-6 px-6 py-5">
                <li className="flex gap-4">
                    <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold", finishing ? "bg-success-muted text-success-text" : "bg-primary/10 text-primary")}>{finishing ? <Check className="size-4" aria-hidden="true" /> : 1}</span>
                    <div className="min-w-0 flex-1">
                        <p className="font-semibold text-foreground">Type your domain</p>
                        {finishing ? (
                            <p className="mt-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground">{state.domain.domain}</p>
                        ) : (
                            <form
                                className="mt-2 space-y-2"
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    const problem = validateDomain(input);
                                    setError(problem);
                                    if (!problem) add.mutate(sanitizeDomain(input));
                                }}
                            >
                                <Input aria-label="Your domain" value={input} placeholder="shop.example.com" autoComplete="off" autoCapitalize="none" spellCheck={false} aria-invalid={Boolean(error)} disabled={add.isPending} onChange={(e) => { setInput(e.target.value); if (error) setError(null); }} />
                                {error ? <p className="flex items-center gap-1.5 text-sm text-danger-text"><AlertCircle className="size-4" aria-hidden="true" />{error}</p> : <p className="text-xs text-muted-foreground">Without http:// or https://</p>}
                                <div className="flex justify-end gap-2 pt-1">
                                    <Button type="button" variant="outline" onClick={onClose} disabled={add.isPending}>Cancel</Button>
                                    <Button type="submit" disabled={add.isPending}>{add.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />} Add domain</Button>
                                </div>
                            </form>
                        )}
                    </div>
                </li>
                <li className={cn("flex gap-4", !finishing && "opacity-50")}>
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">2</span>
                    <div className="min-w-0 flex-1">
                        <p className="font-semibold text-foreground">Add this record at your domain provider</p>
                        {finishing ? (
                            <div className="mt-2 overflow-hidden rounded-xl border text-sm">
                                <div className="grid grid-cols-[60px_1fr_1.4fr] bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground"><span>Type</span><span>Name</span><span>Value</span></div>
                                <div className="grid grid-cols-[60px_1fr_1.4fr] items-center px-3 py-3">
                                    <span className="font-semibold text-foreground">{state.dns.type}</span>
                                    <span className="flex items-center gap-1 font-mono text-xs text-foreground">{state.dns.name}<CopyButton value={state.dns.name} label="Name" /></span>
                                    <span className="flex items-center gap-1 font-mono text-xs text-foreground">{state.dns.value}<CopyButton value={state.dns.value} label="Value" /></span>
                                </div>
                            </div>
                        ) : (
                            <p className="mt-1 text-sm text-muted-foreground">{domainName ? `We'll show the exact record for ${domainName}.` : "We'll show you the exact record."}</p>
                        )}
                    </div>
                </li>
                <li className={cn("flex gap-4", !finishing && "opacity-50")}>
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">3</span>
                    <div className="min-w-0 flex-1">
                        <p className="font-semibold text-foreground">We check it for you</p>
                        <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">{finishing ? <Loader2 className={cn("size-4 text-primary", check.isPending && "animate-spin")} aria-hidden="true" /> : null}Usually under 10 minutes</p>
                    </div>
                </li>
            </ol>
            {finishing ? (
                <div className="flex justify-end gap-2 border-t px-6 py-4">
                    <Button variant="outline" onClick={onClose}>Close</Button>
                    <Button disabled={check.isPending} onClick={() => check.mutate(state.domain.id)}>
                        {check.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />} Verify domain
                    </Button>
                </div>
            ) : null}
        </Card>
    );
}

function DomainRow({ appId, domain, only, onFinish, previewBusy, onPreview }: { appId: string; domain: AppDomainRecord; only: boolean; onFinish: () => void; previewBusy: boolean; onPreview: (action: "regenerate" | "disable", id: string) => void }) {
    const queryClient = useQueryClient();
    const [deleting, setDeleting] = useState(false);
    const refresh = () => queryClient.invalidateQueries({ queryKey: ["app-domains", appId] });
    const check = useMutation({
        mutationFn: () => api.checkAppDomain(appId, domain.id),
        onSuccess: (r) => { void refresh(); toast.message(r.message || "Checked"); },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Check failed"),
    });
    const retry = useMutation({
        mutationFn: () => api.retryDomainSsl(appId, domain.id),
        onSuccess: () => void refresh(),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to retry SSL"),
    });
    const pill = pillFor(domain);
    const sub = subtitleFor(domain);
    const needsDns = domain.type === "custom" && ["pending_dns", "misconfigured"].includes(domain.status);
    return (
        <li className="flex items-center gap-4 px-5 py-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"><Globe className="size-5" aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-foreground">{domain.domain}</p>
                {needsDns ? (
                    <button type="button" onClick={onFinish} className="text-sm font-medium text-primary hover:underline">How to finish →</button>
                ) : sub ? (
                    <p className="truncate text-sm text-muted-foreground">{sub}</p>
                ) : null}
            </div>
            <span className={cn("flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium", PILL_CLASS[pill.tone])}>
                <span className={cn("size-1.5 rounded-full", PILL_DOT[pill.tone])} aria-hidden="true" />{pill.label}
            </span>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={`Options for ${domain.domain}`}><MoreHorizontal aria-hidden="true" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild><a href={domainOpenUrl(domain)} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" /> Open</a></DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void copyText(domain.domain, "Domain")}><Copy aria-hidden="true" /> Copy domain</DropdownMenuItem>
                    {domain.type === "custom" ? (
                        <>
                            <DropdownMenuItem onSelect={onFinish}>Show DNS record</DropdownMenuItem>
                            <DropdownMenuItem disabled={check.isPending} onSelect={() => check.mutate()}><RefreshCw aria-hidden="true" /> Check now</DropdownMenuItem>
                            {canRetrySsl(domain) ? <DropdownMenuItem disabled={retry.isPending} onSelect={() => retry.mutate()}>Retry HTTPS</DropdownMenuItem> : null}
                        </>
                    ) : (
                        <>
                            <DropdownMenuItem disabled={previewBusy} onSelect={() => onPreview("regenerate", domain.id)}><RefreshCw aria-hidden="true" /> Make a new address</DropdownMenuItem>
                            {domain.enabled ? <DropdownMenuItem disabled={previewBusy} onSelect={() => onPreview("disable", domain.id)}>Turn off</DropdownMenuItem> : null}
                        </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-danger-text focus:text-danger-text" onSelect={() => setDeleting(true)}>Remove</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            <DomainDeleteDialog domain={domain} appId={appId} open={deleting} onOpenChange={setDeleting} onSuccess={() => void refresh()} isOnlyActiveUrl={only} />
        </li>
    );
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
    const queryClient = useQueryClient();
    const [panel, setPanel] = useState<PanelState>(null);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const refresh = () => queryClient.invalidateQueries({ queryKey: ["app-domains", appId] });

    const createPreview = useMutation({
        mutationFn: () => api.createPreviewDomain(appId),
        onSuccess: () => { void refresh(); toast.success("Your Opslin address is ready"); },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't create the address"),
    });
    const previewAction = useMutation({
        mutationFn: async ({ action, id }: { action: "regenerate" | "disable"; id: string }) =>
            action === "regenerate" ? api.regeneratePreviewDomain(appId) : api.disableAppDomain(appId, id),
        onSuccess: () => void refresh(),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't update the address"),
    });

    if (deleteLocked) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Domain changes paused</CardTitle>
                    <CardDescription>Domain changes are off while the app is being deleted.</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    if (domainsLoading) {
        return (
            <div className="space-y-6">
                <CardSkeleton count={1} />
            </div>
        );
    }

    const domains = visibleDomainRecords(domainData?.domains ?? []);
    const preview = domains.find((d) => d.type === "preview" && d.enabled) ?? domains.find((d) => d.type === "preview") ?? null;
    const custom = domains.filter((d) => d.type === "custom");
    const rows = [...(preview ? [preview] : []), ...custom];
    const activeCount = domains.filter((d) => d.enabled && ["connected", "active"].includes(d.status)).length;
    const hasAddress = Boolean(access) || rows.length > 0;

    return (
        <section className="space-y-6" data-app-id={appId}>
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-foreground">Domains</h2>
                    <p className="text-sm text-muted-foreground">Where people can find your app.</p>
                </div>
                <Button size="lg" onClick={() => setPanel({ mode: "add" })}><Plus aria-hidden="true" /> Add domain</Button>
            </div>

            <div className={cn("grid items-start gap-6", panel && "xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]")}>
                <Card className="gap-0 overflow-hidden rounded-2xl py-0 shadow-xs">
                    <div className="flex items-center justify-between border-b px-5 py-4">
                        <h3 className="font-semibold text-foreground">Your domains</h3>
                        <span className="text-sm text-muted-foreground">{rows.length} {rows.length === 1 ? "domain" : "domains"}</span>
                    </div>
                    <ul className="divide-y">
                        {rows.map((domain) => (
                            <DomainRow
                                key={domain.id}
                                appId={appId}
                                domain={domain}
                                only={activeCount <= 1 && domain.enabled && ["connected", "active"].includes(domain.status)}
                                onFinish={() => setPanel({ mode: "finish", domain, dns: dnsFor(domain) })}
                                previewBusy={previewAction.isPending}
                                onPreview={(action, id) => previewAction.mutate({ action, id })}
                            />
                        ))}
                        {!preview ? (
                            <li className="flex items-center gap-4 px-5 py-4">
                                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"><Globe className="size-5" aria-hidden="true" /></span>
                                <div className="min-w-0 flex-1">
                                    <p className="font-semibold text-foreground">Free Opslin address</p>
                                    <p className="text-sm text-muted-foreground">A link you can share right away.</p>
                                </div>
                                <Button variant="outline" size="sm" disabled={createPreview.isPending || !["running", "stopped", "deploying"].includes(app.status)} onClick={() => createPreview.mutate()}>
                                    {createPreview.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />} Create address
                                </Button>
                            </li>
                        ) : null}
                        {rows.length === 0 && !hasAddress ? <li className="px-5 py-6 text-sm text-muted-foreground">No domains yet.</li> : null}
                    </ul>
                </Card>

                {panel ? <AddDomainPanel appId={appId} state={panel} onClose={() => setPanel(null)} onChange={setPanel} /> : null}
            </div>

            <div className="rounded-2xl border bg-card px-5 py-4 text-sm">
                <button type="button" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen((v) => !v)} className="flex w-full items-center justify-between text-left font-medium text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                    Advanced: server address
                    <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", advancedOpen && "rotate-180")} aria-hidden="true" />
                </button>
                {advancedOpen ? (
                <div className="mt-4">
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
                </div>
                ) : null}
            </div>
        </section>
    );
}
