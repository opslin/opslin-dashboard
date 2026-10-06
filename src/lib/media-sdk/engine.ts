/* eslint-disable */
// @ts-nocheck
// Copied from opslin-media-sdk by scripts/sync-media-sdk.mjs. Do not edit here; edit the SDK and run the script.
import type { Size } from "./plan";

export type Decoded = { width: number; height: number; handle: unknown };

/** The image work that needs a browser. The default is `createBrowserEngine()`; tests pass a fake. */
export type Engine = {
    /** Decode (applying the EXIF rotation) at no more than `maxEdge` on the long edge. `head` is the file's first bytes. */
    decode(file: Blob, head: Uint8Array, maxEdge: number): Promise<Decoded>;
    /** Re-encode at `size`. Re-encoding removes all metadata (location, camera, time). `type` is what was really produced. */
    encode(decoded: Decoded, size: Size, quality: number): Promise<{ bytes: Uint8Array; type: string }>;
    /** A small RGBA copy for the placeholder, at most `maxEdge` on the long edge. */
    pixels(decoded: Decoded, maxEdge: number): Promise<{ width: number; height: number; rgba: Uint8ClampedArray }>;
    release(decoded: Decoded): void;
};
