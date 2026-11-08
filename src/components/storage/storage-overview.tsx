"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { ArrowUpRight, Check, DatabaseBackup, ImageIcon, Loader2, Lock, MoreHorizontal, Package } from "lucide-react";
import { toast } from "sonner";
import { CloudflareMark, Disclosure } from "@/components/media/media-rows";
import { formatBytes, formatCount } from "@/components/media/media-format";
import { CloudflareSignIn } from "@/components/storage/cloudflare-sign-in";
import { CloudflareTokenConnect } from "@/components/storage/cloudflare-token-connect";
import { SkeletonText } from "@/components/patterns/skeleton";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { placeholderColor, thumbSrc } from "@/components/media/library/use-library";
import { useStorageConnection } from "@/components/storage/use-storage-connection";
import { useMedia } from "@/hooks/use-media";
import { api, type MediaAsset } from "@/lib/api";
import { cn, formatRelativeTime } from "@/lib/utils";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

/** The first load only: the hero arrives, then the three services follow it, 50 ms apart. */
const container: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const item: Variants = {
    hidden: { opacity: 0, y: 8 },
    show: { opacity: 1, y: 0, transition: { duration: 0.24, ease: EASE_OUT } },
};

type ServiceKey = "buckets" | "backups" | "media";

type Service = {
    key: ServiceKey;
    title: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    /** The one number or word the eye lands on. */
    metric: string;
    /** One quiet line under it. */
    detail: string;
    /** Set when the service still needs something from the person. */
    needsSetup: boolean;
    cta: string;
    /** 0-100, only when the API reports a real daily usage. */
    meter?: { percent: number; label: string };
    /** The service exists but its data is hidden until the Cloudflare sign-in is live again. */
    needsSignIn?: boolean;
    /** A short word for the state chip, so the state reads before the numbers do. */
    chip: string;
    /** Real content for the tile's picture. */
    picture: { buckets: string[] } | { verified: boolean; r2: boolean } | { thumbs: MediaAsset[] };
};

function useStorageSummary() {
    const { connection, autoConnecting, autoConnectFailed } = useStorageConnection();
    const connected = Boolean(connection.data?.configured);
    const buckets = useQuery({ queryKey: ["r2Buckets"], queryFn: () => api.getR2Buckets(), enabled: connected });
    const backups = useQuery({ queryKey: ["backupStorage"], queryFn: () => api.getBackupStorage() });
    const media = useMedia();
    const mediaProject = media.data && !media.data.locked && media.data.media.configured ? media.data.media : null;
    const mediaReady = mediaProject?.state === "READY" && mediaProject.cloudflareSignedIn;
    const usage = useQuery({
        queryKey: ["media", "usage"],
        queryFn: () => api.getMediaUsage(),
        enabled: mediaReady,
        staleTime: 30_000,
        retry: false,
    });
    const recent = useQuery({
        queryKey: ["media", "recent-assets"],
        queryFn: () => api.listMediaAssets({ limit: 4, sort: "created", order: "desc" }),
        enabled: mediaReady,
        staleTime: 30_000,
        retry: false,
    });
    return { connection, autoConnecting, autoConnectFailed, buckets, backups, media, mediaProject, mediaReady, usage, recent };
}

function buildServices(summary: ReturnType<typeof useStorageSummary>): Service[] {
    const { buckets, backups, media, mediaProject, mediaReady, usage, recent } = summary;
    const list = buckets.data?.buckets ?? [];
    const services: Service[] = [];

    services.push({
        key: "buckets",
        title: "Buckets",
        href: "/storage/buckets",
        icon: Package,
        metric: list.length === 0 ? "None yet" : `${formatCount(list.length)} ${list.length === 1 ? "bucket" : "buckets"}`,
        detail: list.length === 0 ? "Places to keep your files" : list.slice(0, 2).map((bucket) => bucket.bucketName).join(", ") + (list.length > 2 ? ` +${list.length - 2}` : ""),
        needsSetup: list.length === 0,
        cta: list.length === 0 ? "Create a bucket" : "Open buckets",
        needsSignIn: Boolean(summary.connection.data?.needsReconnect),
        chip: list.length === 0 ? "Empty" : "Active",
        picture: { buckets: list.slice(0, 3).map((bucket) => bucket.bucketName) },
    });

    const backup = backups.data;
    services.push({
        key: "backups",
        title: "Backups",
        href: "/storage/backups",
        icon: DatabaseBackup,
        metric: backup?.configured ? backup.bucket ?? "Connected" : "Not set up",
        detail: backup?.configured
            ? backup.lastVerifiedAt ? `Verified ${formatRelativeTime(backup.lastVerifiedAt)}` : "Saving database backups here"
            : "Choose where database backups go",
        needsSetup: !backup?.configured,
        cta: backup?.configured ? "Open backups" : "Choose a bucket",
        needsSignIn: Boolean(backup?.needsCloudflareSignIn),
        chip: backup?.configured ? "Connected" : "Not set up",
        picture: { verified: Boolean(backup?.configured), r2: backup?.provider === "cloudflare_r2" },
    });

    if (media.data?.locked !== true) {
        const usageData = usage.data && usage.data.available ? usage.data : null;
        services.push({
            key: "media",
            title: "Media",
            href: "/storage/media",
            icon: ImageIcon,
            metric: usageData?.library
                ? `${formatCount(usageData.library.assets)} ${usageData.library.assets === 1 ? "image" : "images"}`
                : mediaReady ? "Ready" : mediaProject ? "Setting up" : "Not set up",
            detail: mediaProject?.publicHostname
                ? usageData?.library ? `${formatBytes(usageData.library.storedBytes)} · ${mediaProject.publicHostname}` : mediaProject.publicHostname
                : "Fast image hosting on your own domain",
            needsSetup: !mediaProject,
            cta: mediaProject ? "Open media" : "Set up image hosting",
            needsSignIn: Boolean(mediaProject && !mediaProject.cloudflareSignedIn),
            chip: mediaReady ? "Live" : mediaProject ? "Setting up" : "Not set up",
            picture: { thumbs: recent.data?.assets ?? [] },
            meter: usageData && usageData.limitsActive
                ? { percent: Math.min(100, Math.max(0, usageData.percent)), label: `${Math.round(usageData.percent)}% of today's limit` }
                : undefined,
        });
    }
    return services;
}

function Pulse() {
    return (
        <span className="relative flex size-2" aria-hidden="true">
            <span className="absolute inline-flex size-full rounded-full bg-emerald-500/60 motion-safe:animate-ping" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
        </span>
    );
}

/** Same geometry as the real screen, so nothing jumps when the data arrives. */
function OverviewSkeleton() {
    return (
        <div className="dashboard-page max-w-5xl" aria-busy="true" aria-label="Loading Storage">
            <Card className="gap-0 p-5">
                <div className="flex items-center gap-4">
                    <SkeletonText className="size-12 rounded-xl" />
                    <div className="space-y-2">
                        <SkeletonText className="h-4 w-28" />
                        <SkeletonText className="h-3.5 w-52" />
                    </div>
                </div>
            </Card>
            <div className="grid gap-4 md:grid-cols-3">
                {Array.from({ length: 3 }, (_, index) => (
                    <Card key={index} className="gap-0 overflow-hidden py-0">
                        <div className="h-36 border-b border-border/70 bg-muted/40" />
                        <div className="p-5">
                            <SkeletonText className="h-4 w-20" />
                            <SkeletonText className="mt-3 h-7 w-32" />
                            <SkeletonText className="mt-2 h-3.5 w-40" />
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    );
}

/** The picture at the top of a tile: real content when there is some, a quiet placeholder when there is not. */
function TilePicture({ service, locked }: { service: Service; locked: boolean }) {
    const picture = service.picture;
    const dashed = "border border-dashed border-border";
    if ("buckets" in picture) {
        const names = picture.buckets;
        return (
            <div className="flex w-full max-w-[15rem] flex-col gap-1.5">
                {Array.from({ length: 3 }, (_, index) => {
                    const name = names[index];
                    return (
                        <div
                            key={index}
                            className={cn(
                                "flex h-8 items-center gap-2 rounded-md px-2.5 text-xs",
                                name && !locked ? "border border-border/70 bg-card font-medium text-foreground shadow-sm" : cn(dashed, "text-transparent")
                            )}
                        >
                            <Package className={cn("size-3.5 shrink-0", name && !locked ? "text-primary" : "text-muted-foreground/50")} aria-hidden="true" />
                            <span className="truncate">{name ?? "empty"}</span>
                            {name && !locked ? <span className="ml-auto size-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" /> : null}
                        </div>
                    );
                })}
            </div>
        );
    }
    if ("verified" in picture) {
        const ok = picture.verified && !locked;
        return (
            <div className="flex flex-col items-center gap-2">
                <span
                    className={cn(
                        "relative flex size-16 items-center justify-center rounded-full",
                        ok ? "bg-emerald-500/10 ring-1 ring-emerald-500/30" : cn(dashed, "text-muted-foreground")
                    )}
                >
                    {ok ? (
                        <Check className="size-7 text-emerald-600 dark:text-emerald-400" strokeWidth={2.25} aria-hidden="true" />
                    ) : (
                        <DatabaseBackup className="size-6 text-muted-foreground/60" aria-hidden="true" />
                    )}
                </span>
                {ok && picture.r2 ? <CloudflareMark className="h-3.5 opacity-80" /> : null}
            </div>
        );
    }
    const thumbs = picture.thumbs;
    return (
        <div className="grid w-full max-w-[15rem] grid-cols-4 gap-1.5">
            {Array.from({ length: 4 }, (_, index) => {
                const asset = thumbs[index];
                return asset && !locked ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        key={asset.id}
                        src={thumbSrc(asset) ?? undefined}
                        alt=""
                        loading="lazy"
                        className="aspect-square w-full rounded-md object-cover ring-1 ring-black/5"
                        style={{ backgroundColor: placeholderColor(asset.thumbhash) }}
                    />
                ) : (
                    <span key={index} className={cn("flex aspect-square items-center justify-center rounded-md", dashed)}>
                        <ImageIcon className="size-4 text-muted-foreground/40" aria-hidden="true" />
                    </span>
                );
            })}
        </div>
    );
}

function ServiceTile({ service, locked }: { service: Service; locked: boolean }) {
    const body = (
        <>
            <div className="relative flex h-36 items-center justify-center border-b border-border/70 bg-muted/40 px-5">
                <TilePicture service={service} locked={locked} />
                {locked ? (
                    <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-card px-2 py-1 text-[11px] font-medium text-muted-foreground shadow-sm ring-1 ring-border">
                        <Lock className="size-3" aria-hidden="true" /> Needs Cloudflare
                    </span>
                ) : null}
            </div>
            <div className="p-5">
                <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-foreground">{service.title}</span>
                    {locked ? null : (
                        <span
                            className={cn(
                                "rounded-full px-2 py-0.5 text-[11px] font-medium",
                                service.needsSetup ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            )}
                        >
                            {service.chip}
                        </span>
                    )}
                </div>
                {/* Locked: no state, name or number of any kind, only that a sign-in is needed. */}
                <p className={cn("mt-3 truncate text-2xl font-semibold tracking-tight tabular-nums", locked ? "text-muted-foreground" : "text-foreground")}>
                    {locked ? "Signed out" : service.metric}
                </p>
                <p className="mt-1 min-h-5 truncate text-sm text-muted-foreground">{locked ? "Sign in above to see this" : service.detail}</p>
                {service.meter && !locked ? (
                    <div className="mt-3" role="img" aria-label={service.meter.label}>
                        <div className="h-1 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none" style={{ width: `${service.meter.percent}%` }} />
                        </div>
                    </div>
                ) : null}
                {locked ? null : (
                    <span className={cn("mt-5 inline-flex items-center gap-1 text-sm font-medium", service.needsSetup ? "text-primary" : "text-muted-foreground group-hover:text-foreground")}>
                        {service.cta}
                        <ArrowUpRight className="size-3.5 transition-transform duration-150 ease-out group-hover:-translate-y-px group-hover:translate-x-px motion-reduce:transition-none" aria-hidden="true" />
                    </span>
                )}
            </div>
        </>
    );

    if (locked) {
        return (
            <Card className="h-full gap-0 overflow-hidden py-0 shadow-none" aria-label={`${service.title} needs Cloudflare`}>
                {body}
            </Card>
        );
    }
    return (
        <Link
            href={service.href}
            className={cn(
                "group block h-full rounded-xl outline-none",
                "transition-transform duration-150 ease-out active:scale-[0.985] motion-reduce:transition-none",
                "focus-visible:ring-[3px] focus-visible:ring-ring/50"
            )}
        >
            <Card
                className={cn(
                    "h-full gap-0 overflow-hidden py-0 transition-[box-shadow,border-color] duration-150 ease-out motion-reduce:transition-none",
                    "[@media(hover:hover)_and_(pointer:fine)]:group-hover:border-foreground/25 [@media(hover:hover)_and_(pointer:fine)]:group-hover:shadow-md"
                )}
            >
                {body}
            </Card>
        </Link>
    );
}

/**
 * The line that shows the one idea of this section: a single Cloudflare sign-in feeds all three services.
 * It draws itself once, from the Cloudflare card down to each tile, and is hidden on narrow screens where
 * the tiles stack.
 */
function ConnectionRail({ live, reduceMotion }: { live: boolean; reduceMotion: boolean | null }) {
    const draw = (axis: "x" | "y", delay: number) =>
        reduceMotion
            ? {}
            : {
                  initial: axis === "x" ? { scaleX: 0 } : { scaleY: 0 },
                  animate: axis === "x" ? { scaleX: 1 } : { scaleY: 1 },
                  transition: { duration: 0.3, delay, ease: EASE_OUT },
              };
    const tone = live ? "bg-border" : "bg-border/60";
    return (
        <div className="relative hidden h-9 md:-mt-6 md:block" aria-hidden="true">
            <motion.span className={cn("absolute left-1/2 top-0 h-1/2 w-px origin-top", tone)} {...draw("y", 0.1)} />
            <motion.span
                className={cn("absolute top-1/2 h-px origin-center", tone)}
                style={{ left: "calc((100% - 2rem) / 6)", right: "calc((100% - 2rem) / 6)" }}
                {...draw("x", 0.25)}
            />
            <div className="absolute inset-x-0 top-1/2 bottom-0 grid grid-cols-3 gap-4">
                {[0, 1, 2].map((index) => (
                    <div key={index} className="relative">
                        <motion.span className={cn("absolute left-1/2 top-0 h-full w-px origin-top", tone)} {...draw("y", 0.45)} />
                        <span className={cn("absolute -bottom-0.5 left-1/2 size-1.5 -translate-x-1/2 rounded-full", live ? "bg-emerald-500" : "bg-border")} />
                    </div>
                ))}
            </div>
        </div>
    );
}

export function StorageOverview() {
    const reduceMotion = useReducedMotion();
    const queryClient = useQueryClient();
    const summary = useStorageSummary();
    const { connection, buckets, autoConnecting, autoConnectFailed } = summary;
    const [confirmDisconnect, setConfirmDisconnect] = useState(false);

    // One sign-out for all three: the single Cloudflare login is removed, so Media, Buckets and Backups lock together.
    // (Removing only Storage's own record would do nothing visible: it would reconnect itself from the login.)
    const disconnect = useMutation({
        mutationFn: () => api.signOutCloudflare(),
        onSuccess: () => {
            toast.success("Signed out of Cloudflare");
            setConfirmDisconnect(false);
            void queryClient.invalidateQueries();
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : "Unable to disconnect");
            setConfirmDisconnect(false);
        },
    });

    if (connection.isLoading) {
        return <OverviewSkeleton />;
    }

    if (connection.isError || !connection.data) {
        return (
            <div className="dashboard-page max-w-5xl">
                <Card className="flex-row items-center justify-between gap-4 p-5">
                    <p className="text-sm font-medium">Couldn&apos;t load Storage</p>
                    <Button variant="outline" onClick={() => void connection.refetch()}>Retry</Button>
                </Card>
            </div>
        );
    }

    const status = connection.data;
    const connected = status.configured;
    const bucketCount = buckets.data?.buckets.length ?? 0;
    const services = buildServices(summary);
    const animate = reduceMotion ? undefined : { variants: container, initial: "hidden", animate: "show" };
    const child = reduceMotion ? undefined : { variants: item };

    return (
        <motion.div className="dashboard-page max-w-5xl" {...animate}>
            <motion.div {...child}>
                <Card className="gap-0 overflow-hidden py-0">
                    {connected ? (
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 p-5">
                            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted">
                                <CloudflareMark />
                            </span>
                            <div className="min-w-0 flex-1">
                                <h2 className="text-base font-semibold tracking-tight">Cloudflare</h2>
                                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                                    <span className="inline-flex items-center gap-2 text-foreground">
                                        <Pulse />
                                        {status.needsReconnect ? "Needs a fresh sign-in" : "Connected"}
                                    </span>
                                    <span className="truncate">{status.cloudflareAccountName || status.cloudflareAccountId}</span>
                                    {status.lastVerifiedAt ? <span>Verified {formatRelativeTime(status.lastVerifiedAt)}</span> : null}
                                </p>
                            </div>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" aria-label="Cloudflare options" className="size-9">
                                        <MoreHorizontal className="size-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onSelect={() => setConfirmDisconnect(true)}>
                                        Sign out of Cloudflare
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                            {status.needsReconnect ? (
                                <div className="basis-full rounded-xl border border-amber-500/30 bg-amber-500/10 px-4">
                                    <CloudflareSignIn />
                                </div>
                            ) : null}
                        </div>
                    ) : autoConnecting && !autoConnectFailed ? (
                        <div className="flex items-center gap-4 p-5" role="status">
                            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted">
                                <CloudflareMark />
                            </span>
                            <div className="min-w-0 flex-1">
                                <h2 className="text-base font-semibold tracking-tight">Cloudflare</h2>
                                <p className="mt-0.5 text-sm text-muted-foreground">Using the account you signed in with</p>
                            </div>
                            <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Connecting" />
                        </div>
                    ) : (
                        <>
                            <div className="px-5 pt-5">
                                <p className="text-sm text-muted-foreground">One sign-in for buckets, backups and images.</p>
                            </div>
                            <div className="px-5 pb-2">
                                <CloudflareSignIn alreadySignedIn={Boolean(status.cloudflareSignedIn)} />
                            </div>
                            <Disclosure label="Use an API token instead">
                                <CloudflareTokenConnect />
                            </Disclosure>
                        </>
                    )}
                </Card>
            </motion.div>

            <ConnectionRail live={connected} reduceMotion={reduceMotion} />

            <div className="-mt-2 grid gap-4 md:-mt-6 md:grid-cols-3">
                {services.map((service) => (
                    <motion.div key={service.key} className="h-full" {...child}>
                        <ServiceTile service={service} locked={Boolean(service.needsSignIn) || (!connected && service.key !== "backups")} />
                    </motion.div>
                ))}
            </div>

            <AlertDialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Sign out of Cloudflare?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Buckets, Backups and Media all lock until you sign in again. Nothing is deleted: your buckets, files and images stay in Cloudflare{bucketCount > 0 ? ` (${bucketCount} ${bucketCount === 1 ? "bucket" : "buckets"})` : ""}, and scheduled backups keep running.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={disconnect.isPending}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
                            Sign out
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </motion.div>
    );
}
