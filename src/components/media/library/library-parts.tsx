"use client";

import { Folder, Image as ImageIcon, Link2, MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { formatBytes, formatCount } from "@/components/media/media-format";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import type { MediaAsset, MediaFolder } from "@/lib/api";
import { cn, formatRelativeTime } from "@/lib/utils";
import { placeholderColor, thumbSrc } from "./use-library";

// ── type tabs ───────────────────────────────────────────────────────────

/** The library holds images only, so the type tabs are the stored formats. */
export const TYPE_TABS = [
    { value: "all", label: "All Files", mime: null },
    { value: "jpeg", label: "JPEG", mime: "image/jpeg" },
    { value: "png", label: "PNG", mime: "image/png" },
    { value: "webp", label: "WebP", mime: "image/webp" },
    { value: "avif", label: "AVIF", mime: "image/avif" },
] as const;

export type TypeTab = (typeof TYPE_TABS)[number]["value"];

export function matchesType(asset: Pick<MediaAsset, "type">, tab: TypeTab) {
    const mime = TYPE_TABS.find((entry) => entry.value === tab)?.mime;
    return !mime || asset.type === mime;
}

export function formatLabel(type: string) {
    const label = type.replace("image/", "").toUpperCase();
    return label === "JPEG" ? "JPG" : label;
}

// ── folders ─────────────────────────────────────────────────────────────

const FOLDER_COLORS = ["text-primary", "text-chart-violet", "text-chart-sky", "text-warning", "text-success", "text-muted-foreground"] as const;

function folderColor(name: string) {
    let hash = 0;
    for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return FOLDER_COLORS[hash % FOLDER_COLORS.length];
}

export function folderSummary(item: MediaFolder) {
    return `${formatCount(item.assets)} ${item.assets === 1 ? "image" : "images"}${item.folders ? `, ${formatCount(item.folders)} ${item.folders === 1 ? "folder" : "folders"}` : ""}`;
}

export function FolderCard({ item, canWrite, onOpen, onRename, onDelete }: { item: MediaFolder; canWrite: boolean; onOpen: () => void; onRename: () => void; onDelete: () => void }) {
    return (
        <Card className="group relative cursor-pointer gap-0 py-0 transition-shadow hover:shadow-md" onClick={onOpen}>
            <CardContent className="p-4">
                <Folder className={cn("size-12 fill-current stroke-[1]", folderColor(item.name))} aria-hidden="true" />
                <button
                    type="button"
                    className="mt-3 block max-w-full truncate text-left text-sm font-semibold text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={(event) => {
                        event.stopPropagation();
                        onOpen();
                    }}
                >
                    {item.name}
                </button>
                <p className="mt-0.5 text-sm text-muted-foreground">{folderSummary(item)}</p>
            </CardContent>
            {canWrite ? (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" className="absolute right-2 top-2" aria-label={`Folder options for ${item.name}`} onClick={(event) => event.stopPropagation()}>
                            <MoreVertical className="size-4" aria-hidden="true" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
                        <DropdownMenuItem onSelect={onRename}>Rename</DropdownMenuItem>
                        <DropdownMenuItem onSelect={onDelete}>Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            ) : null}
        </Card>
    );
}

// ── files ───────────────────────────────────────────────────────────────

export function Thumb({ asset, size }: { asset: MediaAsset; size: "row" | "tile" }) {
    const src = thumbSrc(asset);
    return (
        <span
            className={cn("flex shrink-0 items-center justify-center overflow-hidden bg-muted", size === "row" ? "size-10 rounded-lg" : "aspect-[4/3] w-full")}
            style={{ backgroundColor: placeholderColor(asset.thumbhash) }}
        >
            {src ? (
                // eslint-disable-next-line @next/next/no-img-element -- served straight from the customer's image domain
                <img src={src} alt="" loading="lazy" className="size-full object-cover" />
            ) : (
                <ImageIcon className="size-5 text-muted-foreground" aria-hidden="true" />
            )}
        </span>
    );
}

export function AssetMenu({ asset, canWrite, onDetails, onMove, onDelete }: { asset: MediaAsset; canWrite: boolean; onDetails: () => void; onMove: () => void; onDelete: () => void }) {
    const copyLink = async () => {
        const url = asset.urls?.master;
        if (!url) {
            toast.error("This image has no public link yet.");
            return;
        }
        try {
            await navigator.clipboard.writeText(url);
            toast.success("Link copied");
        } catch {
            toast.error("Couldn't copy the link.");
        }
    };
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Options for ${asset.name}`} onClick={(event) => event.stopPropagation()}>
                    <MoreVertical className="size-4" aria-hidden="true" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={onDetails}>View details</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void copyLink()}>
                    <Link2 aria-hidden="true" /> Copy link
                </DropdownMenuItem>
                {canWrite ? (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={onMove}>Move</DropdownMenuItem>
                        <DropdownMenuItem onSelect={onDelete}>Delete</DropdownMenuItem>
                    </>
                ) : null}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export function AssetCard({
    asset,
    index,
    selected,
    canWrite,
    showFolder,
    onToggle,
    onOpen,
    onMove,
    onDelete,
}: {
    asset: MediaAsset;
    index: number;
    selected: boolean;
    canWrite: boolean;
    showFolder: boolean;
    onToggle: (id: string, index: number, shift: boolean) => void;
    onOpen: () => void;
    onMove: () => void;
    onDelete: () => void;
}) {
    return (
        <Card className={cn("group relative min-w-0 gap-0 overflow-hidden py-0 transition-shadow hover:shadow-md", selected && "ring-2 ring-primary")}>
            <button type="button" className="block w-full text-left focus-visible:ring-2 focus-visible:ring-ring" onClick={onOpen} aria-label={`Open ${asset.name}`}>
                <Thumb asset={asset} size="tile" />
            </button>
            <span className={cn("absolute left-2 top-2 rounded-md bg-background/90 p-1 shadow-sm", selected ? "opacity-100" : "opacity-0 focus-within:opacity-100 group-hover:opacity-100")}>
                <Checkbox aria-label={`Select ${asset.name}`} checked={selected} onClick={(event) => { event.stopPropagation(); onToggle(asset.id, index, event.shiftKey); }} onCheckedChange={() => undefined} />
            </span>
            <CardContent className="flex items-start gap-1 p-3">
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground" title={asset.name}>{asset.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{formatBytes(asset.bytes)} • {formatLabel(asset.type)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                        {showFolder && asset.folder ? <><span>{asset.folder}</span> · </> : null}
                        {formatRelativeTime(asset.createdAt)}
                    </p>
                </div>
                <AssetMenu asset={asset} canWrite={canWrite} onDetails={onOpen} onMove={onMove} onDelete={onDelete} />
            </CardContent>
        </Card>
    );
}
