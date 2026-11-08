"use client";

import { Suspense, useMemo } from "react";
import { notFound, useRouter, useSearchParams } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { Header } from "@/components/layout/header";
import { StorageOverview } from "@/components/storage/storage-overview";
import { StorageTabs } from "@/components/storage/storage-tabs";
import BucketsPage from "@/app/(dashboard)/storage/buckets/page";
import BackupsPage from "@/app/(dashboard)/storage/backups/page";
import MediaPage from "@/app/(dashboard)/storage/media/page";
import type { MediaAsset } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Design preview for the Storage section with sample data and no sign-in, so every screen and state can be looked
 * at (light, dark, phone) without a Cloudflare account. Nothing here talks to the API. Hidden in production builds.
 *
 *   /storage-demo?view=overview|buckets|backups|media&state=ready|empty&tab=library|install|settings
 */

const VIEWS = ["overview", "buckets", "backups", "media"] as const;
type View = (typeof VIEWS)[number];

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

function swatch(a: string, b: string, label: string) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="320" height="320" fill="url(#g)"/><circle cx="230" cy="90" r="38" fill="rgba(255,255,255,.55)"/><path d="M0 320 L110 170 L190 250 L240 200 L320 320Z" fill="rgba(0,0,0,.22)"/><title>${label}</title></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function asset(id: string, name: string, a: string, b: string): MediaAsset {
    const src = swatch(a, b, name);
    return {
        id, hash: id, name, folder: "products", tags: [], type: "image/webp", bytes: 184_000, width: 1600, height: 1600, thumbhash: null,
        widths: [320], variantBytes: 0, createdAt: ago(1), updatedAt: ago(1), urls: { master: src, variants: { "320": src } },
    };
}

function seed(state: "ready" | "empty") {
    const client = new QueryClient({
        defaultOptions: { queries: { staleTime: Infinity, retry: false, refetchOnMount: false, refetchOnWindowFocus: false } },
    });
    const ready = state === "ready";
    client.setQueryData(["organization", "current"], { slug: "opslin", name: "Opslin" });
    client.setQueryData(
        ["r2Connection"],
        ready
            ? { configured: true, cloudflareAccountId: "acct_1", cloudflareAccountName: "Opslin085@gmail.com's Account", lastVerifiedAt: ago(12) }
            : { configured: false, cloudflareSignedIn: false }
    );
    client.setQueryData(
        ["r2Buckets"],
        {
            buckets: ready
                ? [
                      { id: "b1", bucketName: "opslin-backups", s3Endpoint: "https://acct.r2.cloudflarestorage.com", lastVerifiedAt: ago(1) },
                      { id: "b2", bucketName: "opslin-files", s3Endpoint: "https://acct.r2.cloudflarestorage.com", wiredAppId: "app1", wiredEnvPrefix: "R2" },
                      { id: "b3", bucketName: "img-opslin", jurisdiction: "eu", s3Endpoint: "https://acct.eu.r2.cloudflarestorage.com" },
                  ]
                : [],
        }
    );
    client.setQueryData(
        ["backupStorage"],
        ready ? { configured: true, provider: "cloudflare_r2", bucket: "opslin-backups", lastVerifiedAt: ago(12) } : { configured: false }
    );
    client.setQueryData(
        ["media"],
        ready
            ? {
                  locked: false,
                  media: {
                      configured: true, cloudflareSignedIn: true, id: "m1", state: "READY", engine: "EDGE",
                      cloudflareAccountId: "acct_1", cloudflareAccountName: "Opslin085@gmail.com's Account",
                      publicHostname: "img.opslin.com", bucketName: "img-opslin", uploadUrl: "https://opslin-media-upload.opslin085.workers.dev",
                      allowedOrigins: ["https://shop.opslin.com", "https://opslin.com"], transformsEnabled: true, workerUpdateAvailable: false,
                      lastVerifiedAt: ago(1), createdAt: ago(30), steps: [],
                  },
              }
            : { locked: false, media: { configured: false, cloudflareSignedIn: false } }
    );
    if (ready) {
        client.setQueryData(["media", "usage"], {
            available: true, limitsActive: true, version: "1", day: null, objects: 128, bytes: 48_300_000, uploaders: 3,
            library: { assets: 128, folders: 6, storedBytes: 48_300_000 },
            caps: { projectObjects: 20000, projectBytes: 1e10, ipObjects: 500, ipBytes: 1e8, ipPerMinute: 30 },
            history: [], level: "ok", percent: 12,
        });
        client.setQueryData(["media", "recent-assets"], {
            assets: [
                asset("a1", "Hero banner", "#2563eb", "#7dd3fc"),
                asset("a2", "Sneaker", "#f97316", "#fde68a"),
                asset("a3", "Studio lamp", "#10b981", "#a7f3d0"),
                asset("a4", "Poster", "#a855f7", "#f0abfc"),
            ],
            total: 128, nextCursor: null,
        });
    }
    return client;
}

function Demo() {
    if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_ENABLE_DEMOS !== "1") notFound();

    const params = useSearchParams();
    const router = useRouter();
    const { resolvedTheme, setTheme } = useTheme();
    const view: View = (VIEWS as readonly string[]).includes(params.get("view") ?? "") ? (params.get("view") as View) : "overview";
    const state = params.get("state") === "empty" ? "empty" : "ready";
    const client = useMemo(() => seed(state), [state]);

    const go = (next: Record<string, string>) => {
        const q = new URLSearchParams(params.toString());
        Object.entries(next).forEach(([key, value]) => q.set(key, value));
        router.replace(`/storage-demo?${q.toString()}`);
    };

    return (
        <QueryClientProvider client={client}>
            <div className="border-b border-border/70 bg-muted/40">
                <div className="mx-auto flex max-w-[96rem] flex-wrap items-center gap-2 px-4 py-2 text-xs sm:px-6 lg:px-8">
                    <span className="font-medium text-muted-foreground">Design preview · sample data</span>
                    {VIEWS.map((item) => (
                        <button key={item} onClick={() => go({ view: item })} className={cn("rounded-md px-2.5 py-1", view === item ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
                            {item}
                        </button>
                    ))}
                    <span className="mx-1 h-4 w-px bg-border" />
                    {(["ready", "empty"] as const).map((item) => (
                        <button key={item} onClick={() => go({ state: item })} className={cn("rounded-md px-2.5 py-1", state === item ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
                            {item}
                        </button>
                    ))}
                    <button onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} className="ml-auto rounded-md px-2.5 py-1 text-muted-foreground hover:text-foreground">
                        {resolvedTheme === "dark" ? "Light" : "Dark"}
                    </button>
                </div>
            </div>
            <Header title="Storage" className="max-w-5xl" />
            <div className="dashboard-page max-w-5xl pb-0 pt-4">
                <StorageTabs />
            </div>
            {view === "overview" ? <StorageOverview /> : null}
            {view === "buckets" ? <BucketsPage /> : null}
            {view === "backups" ? <BackupsPage /> : null}
            {view === "media" ? <MediaPage /> : null}
        </QueryClientProvider>
    );
}

export default function StorageDemoPage() {
    return (
        <Suspense fallback={null}>
            <Demo />
        </Suspense>
    );
}
