/* eslint-disable */
// @ts-nocheck
// Copied from opslin-media-sdk by scripts/sync-media-sdk.mjs. Do not edit here; edit the SDK and run the script.
/**
 * ThumbHash encoder (a ~25 byte image placeholder). Algorithm by Evan Wallace, https://github.com/evanw/thumbhash (MIT).
 * `thumbHashToAverageColor` gives the placeholder's colour so a page can paint a box the right colour at once;
 * to draw the full blurred preview use the official `thumbhash` package's decoder on the same bytes.
 */
export function rgbaToThumbHash(w: number, h: number, rgba: ArrayLike<number>): Uint8Array {
    if (w > 100 || h > 100) throw new Error(`${w}x${h} doesn't fit in 100x100`);
    const { PI, round, max, cos, abs } = Math;

    let avgR = 0, avgG = 0, avgB = 0, avgA = 0;
    for (let i = 0, j = 0; i < w * h; i++, j += 4) {
        const alpha = (rgba[j + 3] as number) / 255;
        avgR += (alpha / 255) * (rgba[j] as number);
        avgG += (alpha / 255) * (rgba[j + 1] as number);
        avgB += (alpha / 255) * (rgba[j + 2] as number);
        avgA += alpha;
    }
    if (avgA) {
        avgR /= avgA;
        avgG /= avgA;
        avgB /= avgA;
    }

    const hasAlpha = avgA < w * h;
    const lLimit = hasAlpha ? 5 : 7;
    const lx = max(1, round((lLimit * w) / max(w, h)));
    const ly = max(1, round((lLimit * h) / max(w, h)));
    const l: number[] = [], p: number[] = [], q: number[] = [], a: number[] = [];

    for (let i = 0, j = 0; i < w * h; i++, j += 4) {
        const alpha = (rgba[j + 3] as number) / 255;
        const r = avgR * (1 - alpha) + (alpha / 255) * (rgba[j] as number);
        const g = avgG * (1 - alpha) + (alpha / 255) * (rgba[j + 1] as number);
        const b = avgB * (1 - alpha) + (alpha / 255) * (rgba[j + 2] as number);
        l[i] = (r + g + b) / 3;
        p[i] = (r + g) / 2 - b;
        q[i] = r - g;
        a[i] = alpha;
    }

    const encodeChannel = (channel: number[], nx: number, ny: number): [number, number[], number] => {
        let dc = 0, scale = 0;
        const ac: number[] = [];
        const fx: number[] = [];
        for (let cy = 0; cy < ny; cy++) {
            for (let cx = 0; cx * ny < nx * (ny - cy); cx++) {
                let f = 0;
                for (let x = 0; x < w; x++) fx[x] = cos((PI / w) * cx * (x + 0.5));
                for (let y = 0; y < h; y++) {
                    const fy = cos((PI / h) * cy * (y + 0.5));
                    for (let x = 0; x < w; x++) f += (channel[x + y * w] as number) * (fx[x] as number) * fy;
                }
                f /= w * h;
                if (cx || cy) {
                    ac.push(f);
                    scale = max(scale, abs(f));
                } else {
                    dc = f;
                }
            }
        }
        if (scale) for (let i = 0; i < ac.length; i++) ac[i] = 0.5 + (0.5 / scale) * (ac[i] as number);
        return [dc, ac, scale];
    };

    const [lDc, lAc, lScale] = encodeChannel(l, max(3, lx), max(3, ly));
    const [pDc, pAc, pScale] = encodeChannel(p, 3, 3);
    const [qDc, qAc, qScale] = encodeChannel(q, 3, 3);
    const [aDc, aAc, aScale] = hasAlpha ? encodeChannel(a, 5, 5) : [0, [] as number[], 0];

    const isLandscape = w > h;
    const header24 =
        round(63 * lDc) | (round(31.5 + 31.5 * pDc) << 6) | (round(31.5 + 31.5 * qDc) << 12) | (round(31 * lScale) << 18) | ((hasAlpha ? 1 : 0) << 23);
    const header16 = (isLandscape ? ly : lx) | (round(63 * pScale) << 3) | (round(63 * qScale) << 9) | ((isLandscape ? 1 : 0) << 15);
    const hash: number[] = [header24 & 255, (header24 >> 8) & 255, header24 >> 16, header16 & 255, header16 >> 8];
    const acStart = hasAlpha ? 6 : 5;
    let acIndex = 0;
    if (hasAlpha) hash.push(round(15 * aDc) | (round(15 * aScale) << 4));

    for (const channel of hasAlpha ? [lAc, pAc, qAc, aAc] : [lAc, pAc, qAc]) {
        for (const f of channel) {
            const at = acStart + (acIndex >> 1);
            hash[at] = (hash[at] ?? 0) | (round(15 * f) << ((acIndex++ & 1) << 2));
        }
    }
    return new Uint8Array(hash);
}

export function thumbHashToAverageColor(hash: Uint8Array): { r: number; g: number; b: number; a: number } {
    const header = (hash[0] ?? 0) | ((hash[1] ?? 0) << 8) | ((hash[2] ?? 0) << 16);
    const l = (header & 63) / 63;
    const p = ((header >> 6) & 63) / 31.5 - 1;
    const q = ((header >> 12) & 63) / 31.5 - 1;
    const hasAlpha = header >> 23 !== 0;
    const a = hasAlpha ? ((hash[5] ?? 0) & 15) / 15 : 1;
    const b = l - (2 / 3) * p;
    const r = (3 * l - b + q) / 2;
    const g = r - q;
    const clamp = (v: number) => Math.max(0, Math.min(1, v));
    return { r: clamp(r), g: clamp(g), b: clamp(b), a };
}

/** A CSS colour for the placeholder box, e.g. "rgb(120 90 60)". */
export function averageColorCss(hash: Uint8Array): string {
    const { r, g, b } = thumbHashToAverageColor(hash);
    return `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;
}
