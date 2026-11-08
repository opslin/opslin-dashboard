"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Check, Eye, EyeOff, ImageIcon, Loader2 } from "lucide-react";
import { Disclosure, LockedLine, Panel, Row, Section } from "@/components/media/media-rows";
import { CodeBlock, CopyButton } from "@/components/media/media-ready";
import { formatCount } from "@/components/media/media-format";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { placeholderColor, previewSrc } from "@/components/media/library/use-library";
import { api, type MediaAsset, type MediaState } from "@/lib/api";
import { cn } from "@/lib/utils";

type Project = Extract<MediaState, { configured: true }>;

export function browserSnippet(upload: string, image: string) {
    return `import { createMedia } from "@opslin/media";

const media = createMedia({
    uploadUrl: "${upload}",
    imageUrl: "${image}",
});

// <input type="file" multiple>: one call per file
const image = await media.upload(file, {
    folder: "products/banners",
    tags: ["sale"],
    onProgress: ({ stage, done, total }) => console.log(stage, done, total),
});

// Save image.id and image.thumbhash with your record, then show it:
//   <img src={media.url(image.id, 640, image.widths)} srcset={image.srcset}
//        style={{ background: image.averageColor }} />`;
}

const attr = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** Plain HTML for one real image: responsive sizes, no JavaScript, works in any page or email-safe template. */
export function htmlSnippet(asset: MediaAsset): string | null {
    if (!asset.urls) return null;
    const urls = asset.urls;
    const sizes = asset.widths.filter((width) => urls.variants[String(width)]);
    const src = urls.variants["640"] ?? urls.master;
    const lines = ["<img", `  src="${attr(src)}"`];
    if (sizes.length > 0) {
        lines.push(`  srcset="${sizes.map((width) => `${attr(urls.variants[String(width)])} ${width}w`).join(", ")}"`);
        lines.push('  sizes="(max-width: 640px) 100vw, 640px"');
    }
    if (asset.width && asset.height) lines.push(`  width="${asset.width}" height="${asset.height}"`);
    lines.push(`  alt="${attr(asset.name)}"`, '  loading="lazy"', "/>");
    return lines.join("\n");
}

export function serverSnippet(upload: string) {
    return `import { createServerClient } from "@opslin/media/server";

// Keep the key on the server (an environment variable), never in a browser.
const media = createServerClient({ uploadUrl: "${upload}", apiKey: process.env.OPSLIN_MEDIA_KEY });

await media.upload({ bytes, type: "image/jpeg", folder: "products", name: "Red shoe", tags: ["shoes"] });

const { assets } = await media.assets.list({ folder: "products", recursive: true, q: "shoe", limit: 50 });
await media.assets.update(assets[0].id, { name: "Red shoe v2", folder: "products/2026", tags: ["shoes", "new"] });
await media.assets.bulk({ action: "move", ids: [id1, id2], folder: "archive" });
await media.assets.delete(assets[0].id);

await media.folders.create("products/banners");
await media.folders.rename("products/banners", "products/heroes");
await media.folders.delete("products/old", { withAssets: true });`;
}

export function curlSnippet(upload: string) {
    return `# List images in a folder
curl -H "Authorization: Bearer $KEY" "${upload}/api/assets?folder=products&limit=20"

# Rename and tag an image
curl -X PATCH -H "Authorization: Bearer $KEY" -H "content-type: application/json" \\
  -d '{"name":"New name","tags":["sale"]}' "${upload}/api/assets/$ASSET_ID"

# Delete an image
curl -X DELETE -H "Authorization: Bearer $KEY" "${upload}/api/assets/$ASSET_ID"

# Folders
curl -H "Authorization: Bearer $KEY" "${upload}/api/folders?parent=products"
curl -X POST -H "Authorization: Bearer $KEY" -H "content-type: application/json" -d '{"path":"products/banners"}' "${upload}/api/folders"`;
}

function ApiKeyRow() {
    const { user } = useAuth();
    const allowed = !user?.orgRole || user.orgRole === "OWNER" || user.orgRole === "ADMIN";
    const [shown, setShown] = useState(false);
    const reveal = useMutation({ mutationFn: () => api.getMediaApiKey(), onSuccess: () => setShown(true) });
    const key = reveal.data?.apiKey;

    return (
        <>
            <Row
                label="API key"
                state={shown && key ? <code className="min-w-0 break-all font-mono text-xs text-foreground">{key}</code> : "Hidden"}
                action={
                    !allowed ? undefined : shown && key ? (
                        <span className="flex items-center gap-1">
                            <CopyButton label="API key" value={key} />
                            <Button variant="outline" size="sm" onClick={() => { setShown(false); reveal.reset(); }}><EyeOff className="mr-2 size-4" aria-hidden="true" />Hide</Button>
                        </span>
                    ) : (
                        <Button variant="outline" onClick={() => reveal.mutate()} disabled={reveal.isPending}>
                            {reveal.isPending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : <Eye className="mr-2 size-4" aria-hidden="true" />}
                            Show key
                        </Button>
                    )
                }
            />
            {!allowed ? <LockedLine>Only owners and admins can see the API key.</LockedLine> : null}
            {allowed && shown ? <LockedLine>Keep it on your server. Anyone with this key can read and delete your images.</LockedLine> : null}
            {reveal.isError ? <LockedLine>The key isn&apos;t available yet. Set up or update the upload service first.</LockedLine> : null}
        </>
    );
}

type Snippet = "browser" | "html" | "server" | "http";

/**
 * What the HTML above produces, drawn in a small browser window so the result is obvious before anything is pasted.
 * It shows the newest real image from the library, never a made-up one.
 */
function PreviewPane({ asset, host }: { asset: MediaAsset | null; host: string }) {
    const src = asset ? previewSrc(asset) : null;
    return (
        <figure className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
            <figcaption className="flex items-center gap-2 border-b border-border/70 bg-muted/50 px-3 py-2">
                <span className="flex gap-1.5" aria-hidden="true">
                    <span className="size-2.5 rounded-full bg-border" />
                    <span className="size-2.5 rounded-full bg-border" />
                    <span className="size-2.5 rounded-full bg-border" />
                </span>
                <span className="min-w-0 flex-1 truncate rounded-md bg-background px-2.5 py-1 text-center font-mono text-[11px] text-muted-foreground">{host}</span>
            </figcaption>
            <div className="flex min-h-48 flex-1 items-center justify-center bg-muted/30 p-4">
                {asset && src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={src}
                        alt={asset.name}
                        width={asset.width ?? undefined}
                        height={asset.height ?? undefined}
                        className="max-h-56 w-auto max-w-full rounded-lg object-contain shadow-sm ring-1 ring-black/5 animate-in fade-in duration-200 motion-reduce:animate-none"
                        style={{ backgroundColor: placeholderColor(asset.thumbhash) }}
                    />
                ) : (
                    <div className="flex flex-col items-center gap-2 text-center text-sm text-muted-foreground">
                        <ImageIcon className="size-6 text-muted-foreground/50" aria-hidden="true" />
                        Upload an image to see it here
                    </div>
                )}
            </div>
        </figure>
    );
}

/** One of the four steps to a working setup: a number or a check, what it is, where it stands, one action. */
function Step({ index, done, title, state, action }: { index: number; done: boolean; title: string; state: React.ReactNode; action?: React.ReactNode }) {
    return (
        <li className="flex flex-col rounded-xl border border-border/70 bg-card p-4">
            <span
                className={cn(
                    "flex size-7 items-center justify-center rounded-full text-xs font-semibold",
                    done ? "bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/30 dark:text-emerald-400" : "bg-muted text-muted-foreground"
                )}
            >
                {done ? <Check className="size-4" strokeWidth={2.5} aria-hidden="true" /> : index}
            </span>
            <p className="mt-3 text-sm font-semibold text-foreground">{title}</p>
            <p className="mt-0.5 min-h-5 text-sm text-muted-foreground">{state}</p>
            {action ? <div className="mt-auto pt-4">{action}</div> : null}
        </li>
    );
}

export function Guide({ media, onGo }: { media: Project; onGo: (tab: "library" | "settings") => void }) {
    const usage = useQuery({ queryKey: ["media", "usage"], queryFn: () => api.getMediaUsage(), staleTime: 30_000, retry: false });
    const images = usage.data && usage.data.available ? (usage.data.library?.assets ?? null) : null;
    const hostname = media.publicHostname;
    const upload = media.uploadUrl;
    const image = hostname ? `https://${hostname}` : null;
    const ready = media.state === "READY" && Boolean(upload && image);
    const websites = media.allowedOrigins.length;
    const [snippet, setSnippet] = useState<Snippet>("browser");
    const recent = useQuery({
        queryKey: ["media", "recent-assets"],
        queryFn: () => api.listMediaAssets({ limit: 4, sort: "created", order: "desc" }),
        enabled: media.state === "READY",
        staleTime: 30_000,
        retry: false,
    });
    const sample = recent.data?.assets.find((item) => item.urls) ?? null;
    const sampleHtml = sample ? htmlSnippet(sample) : null;
    const snippets: { key: Snippet; label: string }[] = [
        { key: "browser", label: "In the browser" },
        { key: "html", label: "HTML" },
        { key: "server", label: "On your server" },
        { key: "http", label: "Plain HTTP" },
    ];

    return (
        <div className="space-y-4">
            <ol className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Get started">
                <Step index={1} done title="Connect Cloudflare" state={media.cloudflareAccountName ?? "Connected"} />
                <Step index={2} done={ready} title="Set up image hosting" state={ready ? "Ready" : "Setting up"} />
                <Step
                    index={3}
                    done={websites > 0}
                    title="Allow your website"
                    state={websites > 0 ? `${formatCount(websites)} ${websites === 1 ? "website" : "websites"}` : "None yet"}
                    action={<Button variant={websites > 0 ? "outline" : "default"} onClick={() => onGo("settings")}>{websites > 0 ? "Manage" : "Add website"}</Button>}
                />
                <Step
                    index={4}
                    done={(images ?? 0) > 0}
                    title="Upload your first image"
                    state={images === null ? "Not checked" : `${formatCount(images)} ${images === 1 ? "image" : "images"}`}
                    action={<Button variant={(images ?? 0) > 0 ? "outline" : "default"} onClick={() => onGo("library")}>Open library<ArrowUpRight className="ml-1.5 size-3.5" aria-hidden="true" /></Button>}
                />
            </ol>

            {ready && upload && image ? (
                <Panel>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-3">
                        <h2 className="text-sm font-semibold">Add it to your app</h2>
                        <div role="tablist" aria-label="Where your code runs" className="inline-flex rounded-full bg-muted p-[3px]">
                            {snippets.map((item) => (
                                <button
                                    key={item.key}
                                    type="button"
                                    role="tab"
                                    id={`snippet-tab-${item.key}`}
                                    aria-selected={snippet === item.key}
                                    aria-controls={`snippet-panel-${item.key}`}
                                    onClick={() => setSnippet(item.key)}
                                    className={cn(
                                        "rounded-full px-3.5 py-1.5 text-sm font-medium outline-none transition-[background-color,color,box-shadow,transform] duration-150 ease-out focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.97] motion-reduce:transition-none",
                                        snippet === item.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
                        <div className="min-w-0">
                            <div role="tabpanel" id="snippet-panel-browser" aria-labelledby="snippet-tab-browser" hidden={snippet !== "browser"}>
                                <CodeBlock code={browserSnippet(upload, image)} label="browser code" />
                            </div>
                            <div role="tabpanel" id="snippet-panel-html" aria-labelledby="snippet-tab-html" hidden={snippet !== "html"}>
                                {sampleHtml ? (
                                    <CodeBlock code={sampleHtml} label="HTML code" />
                                ) : (
                                    <LockedLine>Upload your first image and its ready-made HTML appears here.</LockedLine>
                                )}
                            </div>
                        </div>
                        {snippet === "browser" || snippet === "html" ? (
                            <div className="px-5 pb-4 lg:px-0 lg:pb-4 lg:pr-5">
                                <PreviewPane asset={sample} host={hostname ?? image} />
                            </div>
                        ) : null}
                    </div>
                    <div role="tabpanel" id="snippet-panel-server" aria-labelledby="snippet-tab-server" hidden={snippet !== "server"}>
                        <CodeBlock code={serverSnippet(upload)} label="server code" />
                        <ApiKeyRow />
                    </div>
                    <div role="tabpanel" id="snippet-panel-http" aria-labelledby="snippet-tab-http" hidden={snippet !== "http"}>
                        <CodeBlock code={curlSnippet(upload)} label="curl examples" />
                        <LockedLine>Use your API key as $KEY. Routes: /api/assets, /api/assets/bulk, /api/folders, /usage.</LockedLine>
                    </div>
                    <Disclosure label="Good to know">
                        <div className="divide-y divide-border/70">
                            <Row label="Images load from" state={<code className="font-mono text-xs">{image}</code>} />
                            <Row label="Sizes" state="Master up to 2560 px, plus 320, 640 and 1080 wide" />
                            <Row label="Moving a folder" state="Never changes an image address" />
                            <Row label="Deleting" state="May keep loading from Cloudflare's cache for a while" />
                            <Row label="Compression" state="Done on the device before upload, as WebP" />
                            <Row label="Package" state="@opslin/media is in early access, not on npm yet" />
                        </div>
                    </Disclosure>
                </Panel>
            ) : (
                <Panel>
                    <Section label="Add it to your app">
                        <Row label="In the browser, on your server, plain HTTP" state="Available when image hosting is ready" />
                    </Section>
                </Panel>
            )}
        </div>
    );
}
