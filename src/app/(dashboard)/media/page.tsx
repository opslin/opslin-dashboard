"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, Loader2, Lock } from "lucide-react";
import { buildMediaSetupInput, mediaImageHostname } from "@/components/media/media-setup";
import { AllowedWebsites, CopyButton, CopySnippetAction, RemoveHosting, UpdateRow, UsageSection, UseInYourApp } from "@/components/media/media-ready";
import { CloudflareMark, Disclosure, LockedLine, Panel, Row, Section } from "@/components/media/media-rows";
import { sdkSnippet } from "@/components/media/media-format";
import { useCloudflareSignIn } from "@/components/media/use-cloudflare-sign-in";
import { Library } from "@/components/media/library/library";
import { Guide } from "@/components/media/media-guide";
import { MediaStepRail, detailNeed, notStartedSteps } from "@/components/media/media-step-rail";
import { LivePulse } from "@/components/patterns/live-pulse";
import { SkeletonText } from "@/components/patterns/skeleton";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { followMediaSetup, useMedia } from "@/hooks/use-media";
import { ApiRequestError, api, type MediaState } from "@/lib/api";
import { cn, formatRelativeTime } from "@/lib/utils";

// UI-only choice sentinel: "go live later, pick a domain afterwards" (the API takes no zone then).
const NO_DOMAIN = "__none__";

type ConnectionNotice = "denied" | "error" | "blocked" | null;
type Project = Extract<MediaState, { configured: true }>;

function noticeFromQuery(value: string | null): ConnectionNotice {
    return value === "denied" || value === "error" || value === "blocked" ? value : null;
}

function errorText(error: unknown, fallback: string) {
    return error instanceof Error && error.message ? error.message : fallback;
}

function MediaSkeleton() {
    return (
        <Panel aria-busy="true" aria-label="Loading Media">
            <Section>
                <Row leading={<SkeletonText className="h-5 w-11" />} label={<SkeletonText className="h-4 w-24" />} state={<SkeletonText className="h-4 w-28" />} />
            </Section>
            <Section label="Setup">
                {Array.from({ length: 3 }, (_, index) => (
                    <Row key={index} label={<SkeletonText className="h-4 w-40" />} />
                ))}
            </Section>
        </Panel>
    );
}

function LockedState() {
    return (
        <Panel>
            <Section>
                <Row
                    leading={<Lock className="size-4 text-muted-foreground" aria-hidden="true" />}
                    label="Media isn't turned on for this organization"
                />
                <LockedLine>Only Opslin can turn it on during early access.</LockedLine>
            </Section>
        </Panel>
    );
}

/** Before anything exists: the Cloudflare row is the one focal action, and the setup rows preview what will happen. */
function ConnectState({ notice }: { notice: ConnectionNotice }) {
    const signIn = useCloudflareSignIn();
    const noticeLine =
        notice === "denied"
            ? "Cloudflare access wasn't granted."
            : notice === "error"
              ? "Couldn't finish connecting to Cloudflare. Try again."
              : null;
    const line = signIn.line ?? noticeLine;

    return (
        <Panel>
            <Section>
                <Row
                    leading={<CloudflareMark />}
                    label="Cloudflare"
                    state="Not connected"
                    action={
                        <Button onClick={signIn.start} disabled={signIn.pending}>
                            {signIn.pending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : null}
                            Connect Cloudflare
                        </Button>
                    }
                />
                {line ? <LockedLine>{line}</LockedLine> : null}
            </Section>
            <Section label="Setup">
                <MediaStepRail steps={notStartedSteps()} notStarted />
            </Section>
        </Panel>
    );
}

/** Signed in, nothing created yet: the same layout, with the account and domain rows now live. */
function PickState() {
    const queryClient = useQueryClient();
    const [chosenAccountId, setAccountId] = useState("");
    const [zoneChoice, setZoneChoice] = useState(NO_DOMAIN);

    const accounts = useQuery({
        queryKey: ["media", "cloudflare", "accounts"],
        queryFn: () => api.getMediaCloudflareAccounts(),
        retry: false,
    });
    const accountList = useMemo(() => accounts.data?.accounts ?? [], [accounts.data]);

    // One account is the common case: use it for the customer instead of asking.
    const accountId = chosenAccountId || (accountList.length === 1 ? accountList[0].id : "");

    const zones = useQuery({
        queryKey: ["media", "cloudflare", "zones", accountId],
        queryFn: () => api.getMediaCloudflareZones(accountId),
        enabled: accountId.length > 0,
        retry: false,
    });
    const zoneList = useMemo(() => zones.data?.zones ?? [], [zones.data]);
    const selectedZone = zoneList.find((candidate) => candidate.id === zoneChoice);

    const setup = useMutation({
        mutationFn: () => {
            const account = accountList.find((candidate) => candidate.id === accountId);
            if (!account) {
                throw new Error("Choose an account first");
            }
            return api.setupMedia(buildMediaSetupInput(account, selectedZone));
        },
        onSuccess: () => {
            followMediaSetup(queryClient);
            void queryClient.invalidateQueries({ queryKey: ["media"] });
        },
    });

    const setupLine =
        setup.error instanceof ApiRequestError && setup.error.status === 501
            ? "Setup isn't available yet."
            : setup.error instanceof ApiRequestError && setup.error.status === 409
              ? "Connect Cloudflare again to continue."
              : setup.error
                ? errorText(setup.error, "Setup didn't start. Try again.")
                : accounts.isError
                  ? "Couldn't load your Cloudflare accounts. Connect again to retry."
                  : null;

    return (
        <Panel>
            <Section>
                <Row
                    leading={<CloudflareMark />}
                    label="Cloudflare"
                    state={
                        <>
                            <Check className="size-4 text-success-text" aria-hidden="true" />
                            Connected
                        </>
                    }
                />
                <Row
                    label="Account"
                    action={
                        <Select value={accountId} onValueChange={setAccountId} disabled={accounts.isLoading || accountList.length === 0}>
                            <SelectTrigger aria-label="Cloudflare account" className="w-full min-w-56 sm:w-64">
                                <SelectValue placeholder={accounts.isLoading ? "Loading accounts" : "Choose an account"} />
                            </SelectTrigger>
                            <SelectContent>
                                {accountList.map((account) => (
                                    <SelectItem key={account.id} value={account.id}>
                                        {account.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    }
                />
                <Row
                    label="Domain"
                    state={selectedZone ? `Images load from ${mediaImageHostname(selectedZone)}` : undefined}
                    action={
                        <Select value={zoneChoice} onValueChange={setZoneChoice} disabled={!accountId || zones.isLoading}>
                            <SelectTrigger aria-label="Domain" className="w-full min-w-56 sm:w-64">
                                <SelectValue placeholder="Choose a domain" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NO_DOMAIN}>Choose later</SelectItem>
                                {zoneList.map((zone) => (
                                    <SelectItem key={zone.id} value={zone.id}>
                                        {zone.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    }
                />
            </Section>
            <Section label="Setup">
                <MediaStepRail steps={notStartedSteps()} notStarted />
            </Section>
            <Section>
                <div className="space-y-2 px-5 py-4">
                    <Button onClick={() => setup.mutate()} disabled={!accountId || setup.isPending}>
                        {setup.isPending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : null}
                        Set up image hosting
                    </Button>
                    <p className="text-xs text-muted-foreground">
                        Creates a storage bucket and an upload service in your Cloudflare account. Nothing is stored on Opslin.
                    </p>
                </div>
                {setupLine ? <LockedLine>{setupLine}</LockedLine> : null}
            </Section>
        </Panel>
    );
}

function ProjectState({ media }: { media: Project }) {
    const queryClient = useQueryClient();
    const signIn = useCloudflareSignIn();
    const retry = useMutation({
        mutationFn: () => api.setupMedia({ cloudflareAccountId: media.cloudflareAccountId }),
        onSuccess: () => {
            followMediaSetup(queryClient);
            void queryClient.invalidateQueries({ queryKey: ["media"] });
        },
    });

    // The domain picker is the one action only while the domain is all that blocks setup; a failed step needs Retry first.
    const needsDomain =
        media.steps.some((step) => step.status === "NEEDS_INPUT" && detailNeed(step.detail) === "domain") &&
        !media.steps.some((step) => step.status === "FAILED");
    const [zoneChoice, setZoneChoice] = useState("");
    const zones = useQuery({
        queryKey: ["media", "cloudflare", "zones", media.cloudflareAccountId],
        queryFn: () => api.getMediaCloudflareZones(media.cloudflareAccountId),
        enabled: needsDomain,
        retry: false,
    });
    const zoneList = useMemo(() => zones.data?.zones ?? [], [zones.data]);
    const chosenZone = zoneList.find((zone) => zone.id === zoneChoice);
    const useDomain = useMutation({
        mutationFn: () =>
            api.setupMedia(
                buildMediaSetupInput({ id: media.cloudflareAccountId, name: media.cloudflareAccountName ?? "" }, chosenZone),
            ),
        onSuccess: () => {
            followMediaSetup(queryClient);
            void queryClient.invalidateQueries({ queryKey: ["media"] });
        },
    });

    const ready = media.state === "READY";
    const needsReconnect = media.state === "NEEDS_RECONNECT";
    const needsAttention = media.steps.some((step) => ["FAILED", "NEEDS_INPUT", "WAITING"].includes(step.status));
    const collapseSteps = ready && !needsAttention;
    // Blocked on the customer's own Cloudflare account: say what to do and link straight to it.
    const needsR2 = media.steps.some((step) => step.status === "NEEDS_INPUT" && detailNeed(step.detail) === "r2");
    const accountName = media.cloudflareAccountName ?? "Connected";

    const stateText = ready
        ? "Ready"
        : needsReconnect
          ? "Live, couldn't verify"
          : media.state === "DEGRADED"
            ? "Degraded"
            : media.state === "DISCONNECTING"
              ? "Disconnecting"
              : "Setting up";

    const domainError = useDomain.error
        ? useDomain.error instanceof ApiRequestError && useDomain.error.status === 409
            ? "Connect Cloudflare again to continue."
            : errorText(useDomain.error, "Couldn't use this domain. Try again.")
        : null;

    const retryLine = domainError
        ? domainError
        : retry.error
         ? retry.error instanceof ApiRequestError && retry.error.status === 409
            ? "Connect Cloudflare again to continue."
            : retry.error instanceof ApiRequestError && retry.error.status === 501
              ? "Setup isn't available yet."
              : errorText(retry.error, "Couldn't retry. Try again.")
        : signIn.line;

    // Exactly one primary action per state (DESIGN.md P7).
    const action = needsReconnect ? (
        <Button onClick={signIn.start} disabled={signIn.pending}>
            {signIn.pending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : null}
            Reconnect Cloudflare
        </Button>
    ) : needsDomain && !needsR2 && zones.isError ? (
        <Button onClick={signIn.start} disabled={signIn.pending}>
            {signIn.pending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : null}
            Reconnect Cloudflare
        </Button>
    ) : needsDomain && !needsR2 && zoneList.length > 0 ? (
        <Button onClick={() => useDomain.mutate()} disabled={!chosenZone || useDomain.isPending}>
            {useDomain.isPending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : null}
            Use this domain
        </Button>
    ) : needsAttention && !ready ? (
        <Button onClick={() => retry.mutate()} disabled={retry.isPending}>
            {retry.isPending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : null}
            {needsR2 || (needsDomain && zoneList.length === 0 && !zones.isError) ? "Check again" : "Retry"}
        </Button>
    ) : ready && media.uploadUrl && media.publicHostname ? (
        <CopySnippetAction value={sdkSnippet({ uploadUrl: media.uploadUrl, imageUrl: `https://${media.publicHostname}` })} />
    ) : undefined;

    return (
        <Panel>
            <Section>
                <Row leading={<CloudflareMark />} label="Cloudflare" state={accountName} />
                <Row
                    label="Image hosting"
                    state={
                        <>
                            {ready ? <LivePulse label="Live" /> : null}
                            <span className={ready ? "font-medium text-foreground" : undefined}>{stateText}</span>
                        </>
                    }
                    action={action}
                />
                {needsDomain && !needsR2 && zoneList.length > 0 ? (
                    <Row
                        label="Domain"
                        state={chosenZone ? `Images load from ${mediaImageHostname(chosenZone)}` : undefined}
                        action={
                            <Select value={zoneChoice} onValueChange={setZoneChoice}>
                                <SelectTrigger aria-label="Domain" className="w-full min-w-56 sm:w-64">
                                    <SelectValue placeholder="Choose a domain" />
                                </SelectTrigger>
                                <SelectContent>
                                    {zoneList.map((zone) => (
                                        <SelectItem key={zone.id} value={zone.id}>
                                            {zone.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        }
                    />
                ) : null}
                {needsDomain && !needsR2 ? (
                    <LockedLine>
                        {zones.isError
                            ? "Couldn't load your domains. Connect Cloudflare again."
                            : zones.isLoading
                              ? "Loading the domains on this Cloudflare account."
                              : zoneList.length === 0
                                ? "This Cloudflare account has no domains yet. Add one in Cloudflare, then check again."
                                : "Images load from a domain on this Cloudflare account. Choose one to go live."}
                    </LockedLine>
                ) : null}
                {ready && media.publicHostname ? (
                    <Row
                        label="Image address"
                        state={<code className="font-mono text-sm text-foreground">{`https://${media.publicHostname}`}</code>}
                        action={<CopyButton label="Image address" value={`https://${media.publicHostname}`} />}
                    />
                ) : null}
                {ready && media.uploadUrl ? (
                    <Row
                        label="Upload address"
                        state={<code className="font-mono text-sm text-foreground">{media.uploadUrl}</code>}
                        action={<CopyButton label="Upload address" value={media.uploadUrl} />}
                    />
                ) : null}
                {ready && media.workerUpdateAvailable ? <UpdateRow media={media} /> : null}
                {media.lastVerifiedAt ? <Row label="Last verified" state={formatRelativeTime(media.lastVerifiedAt)} /> : null}
                {needsR2 ? (
                    <LockedLine>
                        <span>
                            Cloudflare needs R2 turned on first. It asks for a payment method.{" "}
                            <a
                                href={`https://dash.cloudflare.com/${media.cloudflareAccountId}/r2/overview`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-2"
                            >
                                Open R2 in Cloudflare
                                <ExternalLink className="size-3" aria-hidden="true" />
                            </a>
                        </span>
                    </LockedLine>
                ) : null}
                {retryLine ? <LockedLine>{retryLine}</LockedLine> : null}
            </Section>

            {ready ? <UsageSection /> : null}

            {collapseSteps ? (
                <Disclosure label="Setup details">
                    <MediaStepRail steps={media.steps} />
                </Disclosure>
            ) : (
                <Section label="Setup">
                    <MediaStepRail steps={media.steps} />
                </Section>
            )}

            {ready ? <AllowedWebsites media={media} /> : null}
            {ready ? <UseInYourApp media={media} /> : null}

            <Disclosure label="Technical details">
                <div className="divide-y divide-border/70">
                    <Row label="Storage bucket" state={<code className="font-mono text-sm text-foreground">{media.bucketName}</code>} />
                    <Row label="Account ID" state={<code className="font-mono text-sm text-foreground">{media.cloudflareAccountId}</code>} />
                </div>
            </Disclosure>
            <RemoveHosting media={media} />
        </Panel>
    );
}

type Tab = "library" | "guide" | "settings";

/** Once image hosting is ready the library is the page; the guide and the settings are one tab away. */
function ReadyView({ media }: { media: Project }) {
    const params = useSearchParams();
    const router = useRouter();
    const raw = params.get("tab");
    const tab: Tab = raw === "guide" || raw === "settings" ? raw : "library";
    const go = (next: string) => router.replace(next === "library" ? "/media" : `/media?tab=${next}`, { scroll: false });
    return (
        <Tabs value={tab} onValueChange={go} className="gap-4">
            <TabsList>
                <TabsTrigger value="library">Library</TabsTrigger>
                <TabsTrigger value="guide">Guide</TabsTrigger>
                <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>
            <TabsContent value="library">
                <Library media={media} />
            </TabsContent>
            <TabsContent value="guide">
                <Guide media={media} onGo={go} />
            </TabsContent>
            <TabsContent value="settings">
                <ProjectState media={media} />
            </TabsContent>
        </Tabs>
    );
}

function MediaContent() {
    const params = useSearchParams();
    const notice = noticeFromQuery(params.get("cloudflare"));
    const queryClient = useQueryClient();
    const { data, isLoading, isError, refetch } = useMedia();

    // Coming back from Cloudflare: refresh so "connected" shows without waiting on the cache.
    useEffect(() => {
        if (params.get("cloudflare") === "connected") {
            void queryClient.invalidateQueries({ queryKey: ["media"] });
        }
    }, [params, queryClient]);

    if (isLoading) {
        return <MediaSkeleton />;
    }

    if (isError || !data) {
        return (
            <Panel>
                <Section>
                    <Row
                        label="Couldn't load Media"
                        action={
                            <Button variant="outline" onClick={() => void refetch()}>
                                Retry
                            </Button>
                        }
                    />
                </Section>
            </Panel>
        );
    }

    if (data.locked || notice === "blocked") {
        return <LockedState />;
    }

    const media = data.media;
    if (media.configured) {
        return media.state === "READY" ? <ReadyView media={media} /> : <ProjectState media={media} />;
    }
    return media.cloudflareSignedIn ? <PickState /> : <ConnectState notice={notice} />;
}

/** The library needs room for its toolbar; the setup and settings screens stay narrow. */
function MediaFrame({ wide, children }: { wide: boolean; children: React.ReactNode }) {
    return (
        <div className={cn("dashboard-page space-y-4", wide ? "max-w-6xl" : "max-w-3xl")}>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Media</h1>
            {children}
        </div>
    );
}

function MediaBody() {
    const params = useSearchParams();
    const { data } = useMedia();
    const tab = params.get("tab");
    const wide = Boolean(data && !data.locked && data.media.configured && data.media.state === "READY" && tab !== "guide" && tab !== "settings");
    return (
        <MediaFrame wide={wide}>
            <MediaContent />
        </MediaFrame>
    );
}

export default function MediaPage() {
    return (
        <Suspense
            fallback={
                <MediaFrame wide={false}>
                    <MediaSkeleton />
                </MediaFrame>
            }
        >
            <MediaBody />
        </Suspense>
    );
}
