import type { MediaAsset } from "@/lib/api";
import { buildZip, type ZipEntry } from "./zip";

const EXTENSION: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" };

/** A name that is safe inside a ZIP or as a file name on any system. */
export function safeSegment(text: string, fallback = "image"): string {
    const cleaned = text
        .replace(/[\u0000-\u001f\u007f<>:"|?*\\/]/g, " ")
        .replace(/\s+/g, " ")
        .split(" ")
        .filter((word) => !/^\.+$/.test(word))
        .join(" ")
        .trim()
        .replace(/^\.+/, "")
        .slice(0, 100)
        .trim();
    return cleaned || fallback;
}

export function extensionFor(type: string): string {
    return EXTENSION[type] ?? "img";
}

/** Folder-preserving file names for a ZIP; two images with the same name in a folder get " (2)", " (3)". */
export function zipNames(assets: MediaAsset[], base = ""): string[] {
    const used = new Set<string>();
    return assets.map((asset) => {
        const folder = asset.folder
            .split("/")
            .filter(Boolean)
            .map((segment) => safeSegment(segment, ""))
            .filter(Boolean)
            .join("/");
        const stem = safeSegment(asset.name);
        const ext = extensionFor(asset.type);
        let candidate = `${base}${folder ? `${folder}/` : ""}${stem}.${ext}`;
        for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${base}${folder ? `${folder}/` : ""}${stem} (${n}).${ext}`;
        used.add(candidate.toLowerCase());
        return candidate;
    });
}

const CSV_COLUMNS = ["id", "name", "folder", "tags", "type", "width", "height", "bytes", "created", "updated", "url"] as const;

/** Spreadsheet-safe: a cell that starts like a formula is neutralized, quotes are doubled. */
function csvCell(value: string | number | null): string {
    let text = value === null ? "" : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function assetsToCsv(assets: MediaAsset[]): string {
    const rows = assets.map((asset) =>
        [asset.id, asset.name, asset.folder, asset.tags.join(";"), asset.type, asset.width, asset.height, asset.bytes, asset.createdAt, asset.updatedAt, asset.urls?.master ?? ""].map(csvCell).join(","),
    );
    return [CSV_COLUMNS.join(","), ...rows].join("\r\n") + "\r\n";
}

export function assetsToJson(assets: MediaAsset[]): string {
    return JSON.stringify(
        assets.map((asset) => ({ id: asset.id, name: asset.name, folder: asset.folder, tags: asset.tags, type: asset.type, width: asset.width, height: asset.height, bytes: asset.bytes, createdAt: asset.createdAt, updatedAt: asset.updatedAt, urls: asset.urls })),
        null,
        2,
    );
}

export function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export const EXPORT_MAX_FILES = 1000;
export const EXPORT_MAX_BYTES = 1024 * 1024 * 1024;

export type ZipProgress = { done: number; total: number };

/** Downloads each image from the image domain (straight from Cloudflare, not through Opslin) and zips them. */
export async function exportZip(assets: MediaAsset[], onProgress?: (progress: ZipProgress) => void, fetchImpl: typeof fetch = fetch, signal?: AbortSignal): Promise<Blob> {
    const withUrls = assets.filter((asset) => asset.urls?.master);
    if (withUrls.length > EXPORT_MAX_FILES) throw new Error(`A ZIP holds up to ${EXPORT_MAX_FILES} images. Select fewer.`);
    if (withUrls.reduce((sum, asset) => sum + asset.bytes, 0) > EXPORT_MAX_BYTES) throw new Error("That is more than 1 GB. Select fewer images.");

    const names = zipNames(withUrls);
    const entries: ZipEntry[] = [];
    for (const [index, asset] of withUrls.entries()) {
        const response = await fetchImpl(asset.urls!.master, { signal });
        if (!response.ok) throw new Error(`Couldn't download "${asset.name}" (${response.status}).`);
        entries.push({ name: names[index] as string, data: new Uint8Array(await response.arrayBuffer()), modified: new Date(asset.createdAt) });
        onProgress?.({ done: index + 1, total: withUrls.length });
    }
    return buildZip(entries);
}
