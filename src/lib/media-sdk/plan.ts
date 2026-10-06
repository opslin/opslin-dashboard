/* eslint-disable */
// @ts-nocheck
// Copied from opslin-media-sdk by scripts/sync-media-sdk.mjs. Do not edit here; edit the SDK and run the script.
/** The ladder of widths pre-made for every image, and the largest edge kept for the master copy. */
export const LADDER = [320, 640, 1080] as const;
export const MASTER_MAX_EDGE = 2560;

export type Size = { width: number; height: number };

/** Scale to fit `maxEdge` without ever enlarging. */
export function fitWithin(width: number, height: number, maxEdge: number): Size {
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** The master and the ladder sizes that are strictly smaller than it (never upscale, never duplicate). */
export function planSizes(width: number, height: number, ladder: readonly number[] = LADDER): { master: Size; variants: Size[] } {
    const master = fitWithin(width, height, MASTER_MAX_EDGE);
    const variants = [...new Set(ladder)]
        .sort((a, b) => a - b)
        .filter((w) => w < master.width)
        .map((w) => ({ width: w, height: Math.max(1, Math.round((master.height * w) / master.width)) }));
    return { master, variants };
}
