"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { CopyButton } from "@/components/media/media-ready";
import { formatBytes } from "@/components/media/media-format";
import { LockedLine, Row, Section } from "@/components/media/media-rows";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { MediaAsset } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";
import { placeholderColor, previewSrc } from "./use-library";

const ADDRESS = "min-w-0 break-all text-right font-mono text-xs text-foreground";

type Handlers = {
    canWrite: boolean;
    error: string | null;
    onRename: (name: string) => void;
    onTags: (tags: string[]) => void;
    onMove: () => void;
    onDelete: () => void;
};

export function AssetDetail({ asset, onClose, ...handlers }: { asset: MediaAsset | null; onClose: () => void } & Handlers) {
    return (
        <Sheet open={Boolean(asset)} onOpenChange={(open) => !open && onClose()}>
            <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-md" aria-describedby={undefined} onOpenAutoFocus={(event) => event.preventDefault()}>
                {asset ? (
                    <>
                        <SheetHeader className="border-b border-border/70 px-5 py-4">
                            <SheetTitle className="truncate pr-8 text-base">{asset.name}</SheetTitle>
                        </SheetHeader>
                        {/* Keyed by the image: the fields start fresh for each one. */}
                        <Body key={asset.id} asset={asset} {...handlers} />
                    </>
                ) : null}
            </SheetContent>
        </Sheet>
    );
}

function Body({ asset, canWrite, error, onRename, onTags, onMove, onDelete }: { asset: MediaAsset } & Handlers) {
    const [name, setName] = useState(asset.name);
    const [tags, setTags] = useState(asset.tags.join(", "));
    const preview = previewSrc(asset);

    const commitName = () => {
        const next = name.trim();
        if (next && next !== asset.name) onRename(next);
        else setName(asset.name);
    };
    const commitTags = () => {
        const next = tags.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean);
        if (next.join("\n") !== asset.tags.join("\n")) onTags(next);
    };

    return (
        <>
            <div className="px-5 pt-4">
                <div
                    className="flex max-h-[50vh] items-center justify-center overflow-hidden rounded-[var(--opslin-radius-lg)]"
                    style={{ backgroundColor: placeholderColor(asset.thumbhash), aspectRatio: asset.width && asset.height ? `${asset.width} / ${asset.height}` : undefined }}
                >
                    {preview ? (
                        // eslint-disable-next-line @next/next/no-img-element -- served straight from the customer's image domain
                        <img src={preview} alt={asset.name} className="size-full object-contain" />
                    ) : null}
                </div>
            </div>
            <Section>
                <Row
                    label="Name"
                    state={canWrite ? undefined : asset.name}
                    action={
                        canWrite ? (
                            <Input aria-label="Name" className="w-48 sm:w-56" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} onBlur={commitName} onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()} />
                        ) : undefined
                    }
                />
                <Row label="Folder" state={asset.folder || "Top level"} action={canWrite ? <Button variant="outline" onClick={onMove}>Move</Button> : undefined} />
                <Row
                    label="Tags"
                    state={canWrite ? undefined : asset.tags.join(", ") || "None"}
                    action={
                        canWrite ? (
                            <Input aria-label="Tags" className="w-48 sm:w-56" placeholder="sale, summer" value={tags} onChange={(event) => setTags(event.target.value)} onBlur={commitTags} onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()} />
                        ) : undefined
                    }
                />
                <Row label="Type" state={asset.type.replace("image/", "").toUpperCase()} />
                <Row label="Size" state={formatBytes(asset.bytes)} />
                {asset.width && asset.height ? <Row label="Dimensions" state={`${asset.width} by ${asset.height}`} /> : null}
                <Row label="Added" state={formatRelativeTime(asset.createdAt)} />
            </Section>
            {error ? <LockedLine>{error}</LockedLine> : null}
            {asset.urls ? (
                <Section label="Addresses">
                    <Row label="Full size" state={<span className={ADDRESS}>{asset.urls.master}</span>} action={<CopyButton label="Full size address" value={asset.urls.master} />} />
                    {Object.entries(asset.urls.variants)
                        .sort((a, b) => Number(b[0]) - Number(a[0]))
                        .map(([width, url]) => (
                            <Row key={width} label={`${width} wide`} state={<span className={ADDRESS}>{url}</span>} action={<CopyButton label={`${width} wide address`} value={url} />} />
                        ))}
                    <Row
                        label="Open image"
                        action={
                            <Button variant="outline" asChild>
                                <a href={asset.urls.master} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="mr-2 size-4" aria-hidden="true" />
                                    Open
                                </a>
                            </Button>
                        }
                    />
                </Section>
            ) : null}
            {canWrite ? (
                <Section>
                    <Row label="Delete image" action={<Button variant="outline" onClick={onDelete}>Delete</Button>} />
                </Section>
            ) : (
                <LockedLine>Only members, admins and owners can change the library.</LockedLine>
            )}
        </>
    );
}
