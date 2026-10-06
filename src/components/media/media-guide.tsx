"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Circle, Eye, EyeOff, Loader2 } from "lucide-react";
import { CloudflareMark, Disclosure, LockedLine, Panel, Row, Section } from "@/components/media/media-rows";
import { CodeBlock, CopyButton } from "@/components/media/media-ready";
import { formatCount } from "@/components/media/media-format";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { api, type MediaState } from "@/lib/api";

type Project = Extract<MediaState, { configured: true }>;

function Done({ done }: { done: boolean }) {
    return done ? <Check className="size-4 text-success-text" aria-hidden="true" /> : <Circle className="size-4 text-muted-foreground" aria-hidden="true" />;
}

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

export function Guide({ media, onGo }: { media: Project; onGo: (tab: "library" | "settings") => void }) {
    const usage = useQuery({ queryKey: ["media", "usage"], queryFn: () => api.getMediaUsage(), staleTime: 30_000, retry: false });
    const images = usage.data && usage.data.available ? (usage.data.library?.assets ?? null) : null;
    const hostname = media.publicHostname;
    const upload = media.uploadUrl;
    const image = hostname ? `https://${hostname}` : null;
    const ready = media.state === "READY" && Boolean(upload && image);
    const websites = media.allowedOrigins.length;

    return (
        <Panel>
            <Section label="Get started">
                <Row leading={<CloudflareMark />} label="Connect Cloudflare" state={<><Done done />{media.cloudflareAccountName ?? "Connected"}</>} />
                <Row label="Set up image hosting" state={<><Done done={ready} />{ready ? "Ready" : "Setting up"}</>} />
                <Row label="Allow your website" state={<><Done done={websites > 0} />{websites > 0 ? `${formatCount(websites)} ${websites === 1 ? "website" : "websites"}` : "None yet"}</>} action={<Button variant="outline" onClick={() => onGo("settings")}>{websites > 0 ? "Manage" : "Add website"}</Button>} />
                <Row label="Upload your first image" state={<><Done done={(images ?? 0) > 0} />{images === null ? "Not checked" : `${formatCount(images)} ${images === 1 ? "image" : "images"}`}</>} action={<Button variant={(images ?? 0) > 0 ? "outline" : "default"} onClick={() => onGo("library")}>Open library</Button>} />
            </Section>

            {ready && upload && image ? (
                <Section label="Use it">
                    <details open className="group">
                        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-5 text-sm font-medium [&::-webkit-details-marker]:hidden">In the browser</summary>
                        <CodeBlock code={browserSnippet(upload, image)} label="browser code" />
                    </details>
                    <Disclosure label="On your server">
                        <CodeBlock code={serverSnippet(upload)} label="server code" />
                        <ApiKeyRow />
                    </Disclosure>
                    <Disclosure label="Plain HTTP">
                        <CodeBlock code={curlSnippet(upload)} label="curl examples" />
                        <LockedLine>Use your API key as $KEY. Routes: /api/assets, /api/assets/bulk, /api/folders, /usage.</LockedLine>
                    </Disclosure>
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
                </Section>
            ) : (
                <Section label="Use it">
                    <Row label="In the browser, on your server, plain HTTP" state="Available when image hosting is ready" />
                </Section>
            )}
        </Panel>
    );
}
