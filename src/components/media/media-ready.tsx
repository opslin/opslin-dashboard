"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Disclosure, LockedLine, Row, Section } from "@/components/media/media-rows";
import { formatBytes, formatCount, parseWebsite, sdkSnippet } from "@/components/media/media-format";
import { useCloudflareSignIn } from "@/components/media/use-cloudflare-sign-in";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { followMediaSetup } from "@/hooks/use-media";
import { ApiRequestError, api, type MediaRemoveReport, type MediaState, type MediaUsage } from "@/lib/api";

type Project = Extract<MediaState, { configured: true }>;

const WRAPPING = "min-w-0 break-all font-mono text-sm text-foreground";

function Spinner() {
    return <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />;
}

/** "Connect Cloudflare again" is the one honest answer when a change needs a sign-in that has ended. */
function needsSignIn(error: unknown) {
    return error instanceof ApiRequestError && error.status === 409;
}

export function CopyButton({ label, value }: { label: string; value: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <Button
            variant="ghost"
            size="icon"
            aria-label={`Copy ${label.toLowerCase()}`}
            onClick={() => {
                void navigator.clipboard.writeText(value).then(() => {
                    setCopied(true);
                    toast.success("Copied");
                    window.setTimeout(() => setCopied(false), 1500);
                });
            }}
        >
            {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
        </Button>
    );
}

/** The one primary action of the Ready state: copies this project's setup code. */
export function CopySnippetAction({ value }: { value: string }) {
    return (
        <Button
            onClick={() => {
                void navigator.clipboard.writeText(value).then(() => toast.success("Copied"));
            }}
        >
            Copy SDK snippet
        </Button>
    );
}

/** The upload service is behind the current template: one action, which needs a Cloudflare sign-in. */
export function UpdateRow({ media }: { media: Project }) {
    const queryClient = useQueryClient();
    const signIn = useCloudflareSignIn();
    const update = useMutation({
        mutationFn: () => api.setupMedia({ cloudflareAccountId: media.cloudflareAccountId, cloudflareAccountName: media.cloudflareAccountName ?? undefined, refresh: true }),
        onSuccess: () => {
            followMediaSetup(queryClient);
            void queryClient.invalidateQueries({ queryKey: ["media"] });
        },
    });
    const reconnect = needsSignIn(update.error);
    return (
        <>
            <Row
                label="Upload service"
                state="Update available"
                action={
                    reconnect ? (
                        <Button onClick={signIn.start} disabled={signIn.pending}>
                            {signIn.pending ? <Spinner /> : null}
                            Connect Cloudflare
                        </Button>
                    ) : (
                        <Button variant="outline" onClick={() => update.mutate()} disabled={update.isPending}>
                            {update.isPending ? <Spinner /> : null}
                            Update upload service
                        </Button>
                    )
                }
            />
            {reconnect ? <LockedLine>Connect Cloudflare to update the upload service.</LockedLine> : null}
            {update.error && !reconnect ? <LockedLine>Couldn&apos;t start the update. Try again.</LockedLine> : null}
            {signIn.line ? <LockedLine>{signIn.line}</LockedLine> : null}
        </>
    );
}

function usageLine(usage: MediaUsage): string | null {
    if (!usage.available) {
        return usage.reason === "unauthorized"
            ? "Update the upload service to see usage and turn on upload limits."
            : usage.reason === "no_upload_service"
              ? "Usage appears once the upload service is set up."
              : "Couldn't reach your upload service. Try again in a moment.";
    }
    if (!usage.limitsActive) return "Upload limits are off for this service. Update it to turn them on.";
    if (usage.level === "full") return "Uploads are paused until 00:00 UTC. Images already stored keep loading.";
    if (usage.level === "warn") return "Near today's upload limit. It resets at 00:00 UTC.";
    return null;
}

export function UsageSection() {
    const usage = useQuery({
        queryKey: ["media", "usage"],
        queryFn: () => api.getMediaUsage(),
        staleTime: 30_000,
        refetchInterval: 60_000,
        retry: false,
    });

    if (usage.isLoading) {
        return (
            <Section label="Usage">
                <Row label="Uploads today" state="Loading" />
            </Section>
        );
    }
    if (usage.isError || !usage.data) {
        return (
            <Section label="Usage">
                <Row label="Uploads today" state="Unavailable" />
                <LockedLine>Couldn&apos;t load usage. Try again in a moment.</LockedLine>
            </Section>
        );
    }

    const data = usage.data;
    const line = usageLine(data);
    const meter = (value: number, cap: number) => (cap > 0 ? Math.min(100, Math.round((value / cap) * 100)) : 0);
    const tiles =
        data.available && data.limitsActive
            ? [
                  ...(data.library ? [{ label: "Images", value: `${formatCount(data.library.assets)} in ${formatCount(data.library.folders)} ${data.library.folders === 1 ? "folder" : "folders"}`, percent: null as number | null }] : []),
                  ...(data.library ? [{ label: "Storage used", value: formatBytes(data.library.storedBytes), percent: null as number | null }] : []),
                  { label: "Uploads today", value: `${formatCount(data.objects)} of ${formatCount(data.caps.projectObjects)}`, percent: meter(data.objects, data.caps.projectObjects) },
                  { label: "Data uploaded today", value: `${formatBytes(data.bytes)} of ${formatBytes(data.caps.projectBytes)}`, percent: meter(data.bytes, data.caps.projectBytes) },
              ]
            : [{ label: "Uploads today", value: "Not available", percent: null as number | null }];
    return (
        <Section label="Usage">
            <div className="grid gap-3 p-5 pt-3 sm:grid-cols-2">
                {tiles.map((tile) => (
                    <div key={tile.label} className="rounded-lg bg-muted/50 p-4">
                        <p className="text-xs font-medium text-muted-foreground">{tile.label}</p>
                        <p className="mt-1.5 text-base font-semibold tabular-nums text-foreground">{tile.value}</p>
                        {tile.percent !== null ? (
                            <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-border/70" role="img" aria-label={`${tile.percent}% used`}>
                                <div className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none" style={{ width: `${Math.max(tile.percent, tile.percent > 0 ? 2 : 0)}%` }} />
                            </div>
                        ) : null}
                    </div>
                ))}
            </div>
            {line ? <LockedLine>{line}</LockedLine> : null}
            {data.available && data.history.length > 0 ? (
                <Disclosure label="Earlier days">
                    <div className="divide-y divide-border/70">
                        {data.history.slice(0, 14).map((day) => (
                            <Row key={day.day} label={day.day} state={`${formatCount(day.objects)} uploads, ${formatBytes(day.bytes)}`} />
                        ))}
                    </div>
                </Disclosure>
            ) : null}
        </Section>
    );
}

export function AllowedWebsites({ media }: { media: Project }) {
    const queryClient = useQueryClient();
    const signIn = useCloudflareSignIn();
    const [draft, setDraft] = useState<string[]>(media.allowedOrigins);
    const [typed, setTyped] = useState("");
    const [problem, setProblem] = useState<string | null>(null);

    const dirty = useMemo(() => [...draft].sort().join("\n") !== [...media.allowedOrigins].sort().join("\n"), [draft, media.allowedOrigins]);
    const save = useMutation({
        mutationFn: () => api.setupMedia({ cloudflareAccountId: media.cloudflareAccountId, cloudflareAccountName: media.cloudflareAccountName ?? undefined, allowedOrigins: draft }),
        onSuccess: () => {
            followMediaSetup(queryClient);
            void queryClient.invalidateQueries({ queryKey: ["media"] });
        },
    });

    const add = () => {
        const result = parseWebsite(typed, draft);
        if (!result.ok) {
            setProblem(result.reason);
            return;
        }
        setProblem(null);
        setDraft([...draft, result.origin]);
        setTyped("");
    };

    const reconnect = needsSignIn(save.error);
    return (
        <Disclosure label="Allowed websites" defaultOpen>
            <div className="divide-y divide-border/70">
                {draft.length > 0 ? (
                    <ul className="flex flex-wrap gap-2 px-5 py-4" aria-label="Allowed websites">
                        {draft.map((origin) => (
                            <li key={origin} className="inline-flex max-w-full items-center gap-1 rounded-full bg-muted py-1 pl-3.5 pr-1 text-sm text-foreground animate-in fade-in zoom-in-95 duration-150 motion-reduce:animate-none">
                                <span className={WRAPPING}>{origin}</span>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-6 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
                                    aria-label={`Remove ${origin}`}
                                    onClick={() => setDraft(draft.filter((item) => item !== origin))}
                                >
                                    <X className="size-3.5" aria-hidden="true" />
                                </Button>
                            </li>
                        ))}
                    </ul>
                ) : null}
                <Row
                    label={
                        <Input
                            aria-label="Website address"
                            placeholder="shop.example.com"
                            value={typed}
                            onChange={(event) => setTyped(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") add();
                            }}
                        />
                    }
                    action={
                        <Button variant="outline" onClick={add}>
                            <Plus className="mr-2 size-4" aria-hidden="true" />
                            Add website
                        </Button>
                    }
                />
                {dirty ? (
                    <Row
                        label="Changes not saved"
                        action={
                            reconnect ? (
                                <Button onClick={signIn.start} disabled={signIn.pending}>
                                    {signIn.pending ? <Spinner /> : null}
                                    Connect Cloudflare
                                </Button>
                            ) : (
                                <Button onClick={() => save.mutate()} disabled={save.isPending}>
                                    {save.isPending ? <Spinner /> : null}
                                    Save changes
                                </Button>
                            )
                        }
                    />
                ) : null}
            </div>
            <LockedLine>
                {problem ??
                    (reconnect
                        ? "Connect Cloudflare to save this change."
                        : save.error
                          ? "Couldn't save. Try again."
                          : draft.length === 0
                            ? "No websites yet. Uploads from browsers are blocked until you add one."
                            : "Browsers can upload only from these websites. Saving updates your upload service.")}
            </LockedLine>
            {signIn.line ? <LockedLine>{signIn.line}</LockedLine> : null}
        </Disclosure>
    );
}

/** A block of code with its own copy button. */
export function CodeBlock({ code, label }: { code: string; label: string }) {
    return (
        <div className="flex items-start gap-3 px-5 pb-3">
            <pre className="min-w-0 flex-1 overflow-x-auto rounded-[var(--opslin-radius-lg)] bg-muted px-4 py-3 font-mono text-xs leading-relaxed text-foreground">
                <code>{code}</code>
            </pre>
            <CopyButton label={label} value={code} />
        </div>
    );
}

export function UseInYourApp({ media }: { media: Project }) {
    if (!media.uploadUrl || !media.publicHostname) return null;
    const code = sdkSnippet({ uploadUrl: media.uploadUrl, imageUrl: `https://${media.publicHostname}` });
    return (
        <Disclosure label="Use in your app">
            <CodeBlock code={code} label="SDK snippet" />
            <LockedLine>Early access: the @opslin/media package isn&apos;t on npm yet.</LockedLine>
        </Disclosure>
    );
}

export function RemoveHosting({ media }: { media: Project }) {
    const queryClient = useQueryClient();
    const signIn = useCloudflareSignIn();
    const [confirming, setConfirming] = useState(false);
    const [report, setReport] = useState<MediaRemoveReport | null>(null);

    const remove = useMutation({
        mutationFn: () => api.removeMedia(),
        onSuccess: (result) => {
            setReport(result);
            setConfirming(false);
            if (result.outcome === "removed") {
                toast.success("Image hosting removed");
                const kept = result.kept[0];
                if (kept) {
                    toast(`Storage ${kept.name} was kept because it still holds images. Delete it in Cloudflare when you no longer need it.`, { duration: 20_000 });
                }
            }
            void queryClient.invalidateQueries({ queryKey: ["media"] });
        },
    });

    const reconnect = needsSignIn(remove.error);
    return (
        <Disclosure label="Remove image hosting">
            <div className="divide-y divide-border/70">
                {confirming ? (
                    <>
                        <LockedLine>
                            Removes the image domain, caching rules and upload service from {media.cloudflareAccountName ?? "your Cloudflare account"}. Storage is kept if it still holds images.
                        </LockedLine>
                        <Row
                            label="Remove image hosting"
                            action={
                                <span className="flex items-center gap-2">
                                    <Button variant="outline" onClick={() => setConfirming(false)} disabled={remove.isPending}>
                                        Cancel
                                    </Button>
                                    {reconnect ? (
                                        <Button onClick={signIn.start} disabled={signIn.pending}>
                                            {signIn.pending ? <Spinner /> : null}
                                            Connect Cloudflare
                                        </Button>
                                    ) : (
                                        <Button variant="destructive" onClick={() => remove.mutate()} disabled={remove.isPending}>
                                            {remove.isPending ? <Spinner /> : null}
                                            Remove
                                        </Button>
                                    )}
                                </span>
                            }
                        />
                    </>
                ) : (
                    <Row label="Remove image hosting" action={<Button variant="outline" onClick={() => setConfirming(true)}>Remove</Button>} />
                )}
            </div>
            {reconnect ? <LockedLine>Connect Cloudflare to remove image hosting.</LockedLine> : null}
            {remove.error && !reconnect ? <LockedLine>Couldn&apos;t remove it. Try again.</LockedLine> : null}
            {report?.outcome === "incomplete" ? (
                <LockedLine>
                    Not everything was removed: {report.failed.map((item) => item.what).join(", ")}. Try again.
                </LockedLine>
            ) : null}
            {signIn.line ? <LockedLine>{signIn.line}</LockedLine> : null}
        </Disclosure>
    );
}
