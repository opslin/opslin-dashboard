const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** 1024-based, one decimal from KB up: 12.4 MB. */
export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const index = Math.min(UNITS.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const value = bytes / 1024 ** index;
    return `${index === 0 ? Math.round(value) : value >= 100 ? Math.round(value) : Math.round(value * 10) / 10} ${UNITS[index]}`;
}

export function formatCount(value: number): string {
    return new Intl.NumberFormat("en-US").format(value);
}

/** The setup code shown under "Use in your app", with this project's two addresses filled in. */
export function sdkSnippet(input: { uploadUrl: string; imageUrl: string }): string {
    return `import { createMedia } from "@opslin/media";

const media = createMedia({
    uploadUrl: "${input.uploadUrl}",
    imageUrl: "${input.imageUrl}",
});

// When someone picks a photo (the folder is optional):
const image = await media.upload(file, { folder: "products" });
// Save image.id and image.thumbhash with your record.

// To show it:
// <img src={media.url(image.id, 640, image.widths)} srcset={image.srcset} />`;
}

const ORIGIN_LIMIT = 20;

/** Turns what a person typed into a clean website address, or says why not. */
export function parseWebsite(input: string, existing: readonly string[]): { ok: true; origin: string } | { ok: false; reason: string } {
    const text = input.trim();
    if (!text) return { ok: false, reason: "Enter a website address." };
    let url: URL;
    try {
        url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
    } catch {
        return { ok: false, reason: "That isn't a valid website address." };
    }
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
        return { ok: false, reason: "Websites must start with https (http only for localhost)." };
    }
    if (url.username || url.password) return { ok: false, reason: "That isn't a valid website address." };
    if (existing.includes(url.origin)) return { ok: false, reason: "That website is already in the list." };
    if (existing.length >= ORIGIN_LIMIT) return { ok: false, reason: `You can allow up to ${ORIGIN_LIMIT} websites.` };
    return { ok: true, origin: url.origin };
}
