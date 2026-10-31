"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, ChevronRight, Copy, ExternalLink, Loader2, Lock } from "lucide-react";
import { BrandTile } from "@/components/marketplace/brand-tile";
import { marketplaceAccessLabel, marketplaceChosen, marketplaceNeedsLabel, marketplaceTimeLabel, marketplaceToggleChoice, marketplaceTypedInputs, marketplaceVerifiedLabel, missingRequiredInputs } from "@/components/marketplace/marketplace-format";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import { api, type MarketplaceEntry, type MarketplaceLogin } from "@/lib/api";

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex min-h-11 items-center justify-between gap-4 border-b border-border/70 py-2 text-sm last:border-b-0">
            <span className="text-muted-foreground">{label}</span>
            <span className="min-w-0 text-right font-medium text-foreground [overflow-wrap:anywhere]">{children}</span>
        </div>
    );
}

const NO_VALUES: Record<string, string> = {};

function CopyValue({ value, label }: { value: string; label: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <span className="flex min-w-0 items-center justify-end gap-2">
            <span className="min-w-0 font-mono text-xs [overflow-wrap:anywhere]">{value}</span>
            <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={copied ? `${label} copied` : `Copy ${label.toLowerCase()}`}
                onClick={async () => {
                    try {
                        await navigator.clipboard.writeText(value);
                        setCopied(true);
                        window.setTimeout(() => setCopied(false), 1500);
                    } catch {
                        setCopied(false);
                    }
                }}
            >
                {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
            </Button>
        </span>
    );
}

export function repositoryLabel(url: string) {
    return url.replace(/^https:\/\//, "");
}

/** Side panel for one Marketplace entry: what it is, where it comes from, and the one action. */
export function EntrySheet({
    entry,
    onClose,
    onStarted,
}: {
    entry: MarketplaceEntry | null;
    onClose: () => void;
    onStarted: (job: { serverId: string; jobId: string; label: string }) => void;
}) {
    const serversQuery = useQuery({ queryKey: ["servers"], queryFn: () => api.getServers(), enabled: Boolean(entry) });
    const servers = useMemo(
        () => (serversQuery.data ?? []).filter((server) => server.status === "connected" && server.isLiveConnected !== false),
        [serversQuery.data],
    );
    // The person's choice, or the first online server until they choose.
    const [chosenServerId, setServerId] = useState("");
    const serverId = chosenServerId || servers[0]?.id || "";

    // Settings the person types in, and the sign-in shown once after the deploy starts. Both belong to one entry, so
    // each is stored with the entry it was made for and is ignored once another entry is open.
    const slug = entry?.slug;
    const [draft, setDraft] = useState<{ slug: string | undefined; values: Record<string, string> }>({ slug: undefined, values: {} });
    const values = draft.slug === slug ? draft.values : NO_VALUES;
    const [startedFor, setStartedFor] = useState<{ slug: string | undefined; job: { serverId: string; jobId: string; label: string }; login: MarketplaceLogin } | null>(null);
    const started = startedFor && startedFor.slug === slug ? startedFor : null;

    const deploy = useMutation({
        mutationFn: async () => {
            if (!entry) throw new Error("Choose software first.");
            const prepared = await api.prepareMarketplaceDeploy(entry.slug, marketplaceTypedInputs(entry, values));
            const trigger = await api.triggerAutoDeploy(serverId, {
                gitUrl: prepared.gitUrl,
                branch: prepared.branch,
                appNamePrefix: prepared.appNamePrefix,
                extraEnvVars: prepared.extraEnvVars,
                imageRef: prepared.imageRef,
                marketplaceSlug: prepared.marketplaceSlug,
            });
            return { trigger, login: prepared.login };
        },
        onSuccess: ({ trigger, login }) => {
            if (!entry) return;
            const job = { serverId: trigger.serverId, jobId: trigger.jobId, label: entry.name };
            if (login) {
                // The sign-in is shown once: keep the panel on screen until the person has seen it.
                setStartedFor({ slug, job, login });
                return;
            }
            onStarted(job);
            onClose();
        },
    });

    const finish = () => {
        if (started) onStarted(started.job);
        deploy.reset();
        setStartedFor(null);
        onClose();
    };

    const time = entry ? marketplaceTimeLabel(entry) : null;
    const missing = entry ? missingRequiredInputs(entry, values) : [];
    const noServer = !serversQuery.isLoading && servers.length === 0;

    return (
        <Sheet open={Boolean(entry)} onOpenChange={(open) => { if (!open) finish(); }}>
            <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
                {entry ? (
                    <>
                        <SheetHeader className="flex-row items-center gap-3 border-b border-border/70 p-5 pr-12">
                            <BrandTile entry={entry} />
                            <div className="min-w-0">
                                <SheetTitle className="truncate text-lg">{entry.name}</SheetTitle>
                                <SheetDescription className="sr-only">{entry.label}</SheetDescription>
                                <div className="mt-1">
                                    <StatusBadge status={entry.verified ? "success" : "pending"} tone={entry.verified ? "success" : "neutral"} label={marketplaceVerifiedLabel(entry)} />
                                </div>
                            </div>
                        </SheetHeader>

                        <div className="flex-1 overflow-y-auto px-5 py-2">
                            <DetailRow label="From">Opslin Marketplace</DetailRow>
                            <DetailRow label="Source">{entry.source.kind}</DetailRow>
                            <DetailRow label="Image">
                                <span className="font-mono text-xs">{entry.source.image}</span>
                            </DetailRow>
                            <DetailRow label="Repository">
                                <a href={entry.source.repository} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                                    {repositoryLabel(entry.source.repository)}
                                    <ExternalLink className="size-3" aria-hidden="true" />
                                </a>
                            </DetailRow>
                            <DetailRow label="Needs">{marketplaceNeedsLabel(entry)}</DetailRow>
                            <DetailRow label="Sign-in">{marketplaceAccessLabel(entry)}</DetailRow>
                            {time ? <DetailRow label="Time">{time}</DetailRow> : null}

                            {entry.access.kind === "app" && entry.access.note ? (
                                <p className="border-b border-border/70 py-3 text-sm text-muted-foreground">{entry.access.note}</p>
                            ) : null}

                            {entry.access.kind === "open" ? (
                                <p className="flex items-start gap-2 border-b border-border/70 py-3 text-sm text-muted-foreground">
                                    <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                                    {entry.access.warning}
                                </p>
                            ) : null}

                            {started ? (
                                <div className="pt-4" role="status" aria-live="polite">
                                    <p className="mb-1 text-sm font-medium text-foreground">Save your sign-in</p>
                                    {started.login.username ? <DetailRow label="User">{started.login.username}</DetailRow> : null}
                                    <DetailRow label={started.login.label}><CopyValue value={started.login.secret} label={started.login.label} /></DetailRow>
                                    <p className="pt-2 text-sm text-muted-foreground">Copy it now. It is also saved in the app&apos;s settings.</p>
                                </div>
                            ) : entry.inputs.length > 0 ? (
                                <div className="space-y-3 pt-4">
                                    {entry.inputs.map((input) => input.choices ? (
                                        <fieldset key={input.key}>
                                            <legend className="mb-1.5 flex w-full items-baseline justify-between gap-2 text-sm font-medium text-foreground">
                                                {input.label}
                                                {input.required ? null : <span className="text-xs font-normal text-muted-foreground">Optional</span>}
                                            </legend>
                                            <div className="divide-y divide-border/70 rounded-lg border border-border/70">
                                                {input.choices.map((choice) => {
                                                    const id = `marketplace-input-${input.key}-${choice.value}`;
                                                    return (
                                                        <label key={choice.value} htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                                                            <Checkbox
                                                                id={id}
                                                                checked={marketplaceChosen(input, values).includes(choice.value)}
                                                                onCheckedChange={(checked) => setDraft({ slug, values: { ...values, [input.key]: marketplaceToggleChoice(input, values, choice.value, checked === true) } })}
                                                            />
                                                            <span className="min-w-0 flex-1 font-medium text-foreground">{choice.label}</span>
                                                            {choice.help ? <span className="shrink-0 text-xs text-muted-foreground">{choice.help}</span> : null}
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                            {input.help ? <p className="mt-1 text-xs text-muted-foreground">{input.help}</p> : null}
                                        </fieldset>
                                    ) : (
                                        <div key={input.key}>
                                            <label className="mb-1.5 flex items-baseline justify-between gap-2 text-sm font-medium text-foreground" htmlFor={`marketplace-input-${input.key}`}>
                                                {input.label}
                                                {input.required ? null : <span className="text-xs font-normal text-muted-foreground">Optional</span>}
                                            </label>
                                            <Input
                                                id={`marketplace-input-${input.key}`}
                                                type={input.secret ? "password" : "text"}
                                                autoComplete="off"
                                                spellCheck={false}
                                                value={values[input.key] ?? ""}
                                                onChange={(event) => setDraft({ slug, values: { ...values, [input.key]: event.target.value } })}
                                                aria-required={input.required}
                                            />
                                            {input.help ? <p className="mt-1 text-xs text-muted-foreground">{input.help}</p> : null}
                                        </div>
                                    ))}
                                </div>
                            ) : null}

                            <div className="pt-4">
                                <label className="mb-1.5 block text-sm font-medium text-foreground" htmlFor="marketplace-server">Server</label>
                                <Select value={serverId} onValueChange={setServerId} disabled={servers.length === 0 || Boolean(started)}>
                                    <SelectTrigger id="marketplace-server" className="w-full">
                                        <SelectValue placeholder={serversQuery.isLoading ? "Loading servers" : "No online server"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {servers.map((server) => (
                                            <SelectItem key={server.id} value={server.id}>{server.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {noServer ? <p className="mt-2 text-sm text-muted-foreground">Connect a server with an online agent to deploy.</p> : null}
                            </div>

                            <details className="group mt-4 border-t border-border/70 pt-3 text-sm">
                                <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium text-foreground marker:hidden [&::-webkit-details-marker]:hidden">
                                    <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden="true" />
                                    Technical details
                                </summary>
                                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                                    <li>The image is pinned by digest when you press Deploy, so what runs is exactly what the registry served then.</li>
                                    <li>Opslin creates the databases it needs and generates the secret keys. Nothing is built from source.</li>
                                    <li>Opslin does not verify who published the image.</li>
                                    {entry.details?.map((line) => <li key={line}>{line}</li>)}
                                </ul>
                            </details>

                            {deploy.isError ? (
                                <p role="alert" className="mt-4 rounded-lg bg-danger-muted px-3 py-2 text-sm text-danger-text">
                                    {deploy.error instanceof Error ? deploy.error.message : "Could not start the deploy."}
                                </p>
                            ) : null}
                        </div>

                        <SheetFooter className="border-t border-border/70 p-5">
                            {started ? (
                                <Button className="w-full" onClick={finish}>Show progress</Button>
                            ) : (
                                <Button className="w-full" disabled={!serverId || deploy.isPending || missing.length > 0} onClick={() => deploy.mutate()}>
                                    {deploy.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                                    Deploy to server
                                </Button>
                            )}
                            {missing.length > 0 && !started ? <p className="text-center text-xs text-muted-foreground">{missing[0]} is required.</p> : null}
                        </SheetFooter>
                    </>
                ) : null}
            </SheetContent>
        </Sheet>
    );
}
