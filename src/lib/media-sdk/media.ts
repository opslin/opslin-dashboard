/* eslint-disable */
// @ts-nocheck
// Copied from opslin-media-sdk by scripts/sync-media-sdk.mjs. Do not edit here; edit the SDK and run the script.
import { sha256Hex, toBase64 } from "./hash";
import { readDimensions } from "./dimensions";
import type { Engine } from "./engine";
import { createBrowserEngine } from "./engine-browser";
import { MediaError } from "./errors";
import { LADDER, MASTER_MAX_EDGE, planSizes } from "./plan";
import { averageColorCss, rgbaToThumbHash } from "./thumbhash";
import { putObject } from "./upload";
import { imageSrc, imageSrcset, masterUrl, snapWidth, variantUrl } from "./urls";

export type MediaConfig = {
    /** The upload address shown in Opslin Media (https://….workers.dev). */
    uploadUrl: string;
    /** The image address shown in Opslin Media (https://img.your-domain.com). */
    imageUrl: string;
    fetch?: typeof fetch;
    engine?: Engine;
    /** Ladder widths; must match what the upload service accepts (320, 640, 1080). */
    widths?: readonly number[];
    /** Largest file read from the device, in bytes. Default 50 MB. */
    maxInputBytes?: number;
    quality?: { master?: number; variant?: number };
    sleep?: (ms: number) => Promise<void>;
};

export type UploadProgress = { stage: "reading" | "compressing" | "uploading" | "done"; done: number; total: number };

export type UploadOptions = {
    signal?: AbortSignal;
    onProgress?: (progress: UploadProgress) => void;
    /** Library folder, like "products/banners". Default: the top level. */
    folder?: string;
    /** Display name. Default: the file's name without its extension. */
    name?: string;
    tags?: string[];
};

export type UploadedImage = {
    /** Content hash of the master: never changes, safe to store in your database. */
    id: string;
    /** The library entry for this image (use it with the library API). Null on an upload service without the library. */
    assetId: string | null;
    folder: string;
    name: string;
    width: number;
    height: number;
    /** Widths of the pre-made smaller copies. */
    widths: number[];
    /** URL of the full-size copy (up to 2560 px). */
    url: string;
    srcset: string;
    /** About 25 bytes, base64: store it and show a blurred preview while the image loads. */
    thumbhash: string;
    /** CSS colour matching the image's average, for an instant coloured box. */
    averageColor: string;
    /** True when this exact image was already stored (nothing new was written). */
    alreadyStored: boolean;
    bytes: { master: number; total: number };
};

const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const DEFAULT_MAX_INPUT = 50 * 1024 * 1024;
const HEAD_BYTES = 128 * 1024;
const CONCURRENCY = 2;

async function pool<T>(items: T[], limit: number, run: (item: T) => Promise<void>) {
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const item = items[next++] as T;
            await run(item);
        }
    });
    await Promise.all(workers);
}

export function createMedia(config: MediaConfig) {
    const widths = config.widths ?? LADDER;
    const engine = () => (config.engine ??= createBrowserEngine());
    const fetchFn = config.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
    const maxInput = config.maxInputBytes ?? DEFAULT_MAX_INPUT;
    const masterQuality = config.quality?.master ?? 0.9;
    const variantQuality = config.quality?.variant ?? 0.8;

    async function upload(file: Blob, options: UploadOptions = {}): Promise<UploadedImage> {
        const { signal, onProgress } = options;
        const fileName = "name" in file && typeof file.name === "string" ? file.name.replace(/\.[^.]+$/, "") : "";
        const name = options.name ?? (fileName || undefined);
        const report = (stage: UploadProgress["stage"], done: number, total: number) => onProgress?.({ stage, done, total });
        const stop = () => {
            if (signal?.aborted) throw new MediaError("aborted", "The upload was cancelled.");
        };

        if (!ACCEPTED.has(file.type)) throw new MediaError("unsupported_type", "Only JPEG, PNG, WebP and AVIF images can be uploaded.");
        if (file.size > maxInput) throw new MediaError("too_large", "This image is too large to upload.");

        report("reading", 0, 1);
        const head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
        stop();

        report("compressing", 0, 1);
        const decoded = await engine().decode(file, head, MASTER_MAX_EDGE);
        try {
            const plan = planSizes(decoded.width, decoded.height, widths);
            const encoded = await engine().encode(decoded, plan.master, masterQuality);
            stop();
            const master = { ...encoded, hash: await sha256Hex(encoded.bytes) };

            // The ladder is WebP only (the upload service refuses anything else for a variant), so a browser that can't
            // produce WebP gets the master alone.
            const variants: Array<{ width: number; bytes: Uint8Array; type: string; hash: string }> = [];
            if (master.type === "image/webp") {
                const pending = plan.variants;
                await pool(pending, CONCURRENCY, async (size) => {
                    stop();
                    const out = await engine().encode(decoded, size, variantQuality);
                    if (out.type === "image/webp") variants.push({ width: size.width, ...out, hash: await sha256Hex(out.bytes) });
                });
                variants.sort((a, b) => a.width - b.width);
            }

            const small = await engine().pixels(decoded, 32);
            const thumb = rgbaToThumbHash(small.width, small.height, small.rgba);

            const total = 1 + variants.length;
            let uploaded = 0;
            report("uploading", 0, total);
            const base = { uploadUrl: config.uploadUrl };
            const put = { fetch: fetchFn, signal, sleep: config.sleep };
            const first = await putObject(
                { ...base, kind: "master", bytes: master.bytes, type: master.type, hash: master.hash, thumbhash: toBase64(thumb), folder: options.folder, name, tags: options.tags, pixels: plan.master },
                put,
            );
            report("uploading", ++uploaded, total);

            await pool(variants, CONCURRENCY, async (variant) => {
                await putObject({ ...base, kind: "variant", master: first.id, width: variant.width, bytes: variant.bytes, type: variant.type, hash: variant.hash }, put);
                report("uploading", ++uploaded, total);
            });

            report("done", total, total);
            const made = variants.map((v) => v.width);
            return {
                id: first.id,
                assetId: first.assetId,
                folder: first.folder ?? options.folder ?? "",
                name: first.name ?? name ?? "image",
                width: plan.master.width,
                height: plan.master.height,
                widths: made,
                url: masterUrl(config.imageUrl, first.id),
                srcset: made.length ? imageSrcset(config.imageUrl, first.id, made) : "",
                thumbhash: toBase64(thumb),
                averageColor: averageColorCss(thumb),
                alreadyStored: !first.created,
                bytes: { master: master.bytes.length, total: master.bytes.length + variants.reduce((sum, v) => sum + v.bytes.length, 0) },
            };
        } finally {
            engine().release(decoded);
        }
    }

    return {
        upload,
        /** A URL for about `width` pixels; pass the widths from the upload result as `available`. */
        url: (id: string, width?: number, available: readonly number[] = widths) => imageSrc(config.imageUrl, id, width, available),
        srcset: (id: string, available: readonly number[] = widths) => imageSrcset(config.imageUrl, id, available),
        masterUrl: (id: string) => masterUrl(config.imageUrl, id),
        variantUrl: (id: string, width: number) => variantUrl(config.imageUrl, id, width),
    };
}

export type Media = ReturnType<typeof createMedia>;
export { readDimensions, snapWidth };
