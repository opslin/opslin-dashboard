/* eslint-disable */
// @ts-nocheck
// Copied from opslin-media-sdk by scripts/sync-media-sdk.mjs. Do not edit here; edit the SDK and run the script.
/**
 * Reads an image's size (and a JPEG's EXIF rotation) from the first bytes, so a large photo can be decoded straight
 * at a smaller size instead of in full. Returns null for formats it does not read; the caller then decodes in full.
 */
export type Dimensions = { width: number; height: number };

const u16be = (b: Uint8Array, o: number) => ((b[o] ?? 0) << 8) | (b[o + 1] ?? 0);
const u32be = (b: Uint8Array, o: number) => (((b[o] ?? 0) << 24) | ((b[o + 1] ?? 0) << 16) | ((b[o + 2] ?? 0) << 8) | (b[o + 3] ?? 0)) >>> 0;
const u16le = (b: Uint8Array, o: number) => (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8);
const u24le = (b: Uint8Array, o: number) => (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8) | ((b[o + 2] ?? 0) << 16);
const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));

export function readDimensions(bytes: Uint8Array): Dimensions | null {
    if (bytes.length >= 24 && bytes[0] === 0x89 && ascii(bytes, 1, 4) === "PNG") {
        return { width: u32be(bytes, 16), height: u32be(bytes, 20) };
    }
    if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
        let at = 2;
        while (at + 9 < bytes.length) {
            if (bytes[at] !== 0xff) return null;
            const marker = bytes[at + 1] ?? 0;
            if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
                at += 2;
                continue;
            }
            const length = u16be(bytes, at + 2);
            if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
                return { height: u16be(bytes, at + 5), width: u16be(bytes, at + 7) };
            }
            at += 2 + length;
        }
        return null;
    }
    if (bytes.length >= 30 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") {
        const kind = ascii(bytes, 12, 16);
        if (kind === "VP8X") return { width: u24le(bytes, 24) + 1, height: u24le(bytes, 27) + 1 };
        if (kind === "VP8L") {
            const bits = (bytes[21] ?? 0) | ((bytes[22] ?? 0) << 8) | ((bytes[23] ?? 0) << 16) | ((bytes[24] ?? 0) << 24);
            return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
        }
        if (kind === "VP8 ") return { width: u16le(bytes, 26) & 0x3fff, height: u16le(bytes, 28) & 0x3fff };
    }
    return null;
}

/** EXIF orientation 1 to 8 for a JPEG, or 1 when absent or unreadable. Values 5 to 8 swap width and height. */
export function readJpegOrientation(bytes: Uint8Array): number {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;
    let at = 2;
    while (at + 4 < bytes.length) {
        if (bytes[at] !== 0xff) return 1;
        const marker = bytes[at + 1] ?? 0;
        const length = u16be(bytes, at + 2);
        if (marker === 0xe1 && ascii(bytes, at + 4, at + 8) === "Exif") {
            const tiff = at + 10;
            const little = ascii(bytes, tiff, tiff + 2) === "II";
            const r16 = (o: number) => (little ? u16le(bytes, o) : u16be(bytes, o));
            const r32 = (o: number) => (little ? (u16le(bytes, o) | (u16le(bytes, o + 2) << 16)) >>> 0 : u32be(bytes, o));
            const ifd = tiff + r32(tiff + 4);
            const entries = r16(ifd);
            for (let i = 0; i < entries && i < 64; i++) {
                const entry = ifd + 2 + i * 12;
                if (r16(entry) === 0x0112) {
                    const value = r16(entry + 8);
                    return value >= 1 && value <= 8 ? value : 1;
                }
            }
            return 1;
        }
        if (marker === 0xda) return 1;
        at += 2 + length;
    }
    return 1;
}

/** Dimensions as the viewer sees them, after the EXIF rotation. */
export function displayDimensions(bytes: Uint8Array): Dimensions | null {
    const raw = readDimensions(bytes);
    if (!raw) return null;
    return readJpegOrientation(bytes) >= 5 ? { width: raw.height, height: raw.width } : raw;
}
