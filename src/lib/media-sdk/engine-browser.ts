/* eslint-disable */
// @ts-nocheck
// Copied from opslin-media-sdk by scripts/sync-media-sdk.mjs. Do not edit here; edit the SDK and run the script.
import { displayDimensions } from "./dimensions";
import type { Decoded, Engine } from "./engine";
import { fitWithin, type Size } from "./plan";

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;

function makeCanvas(width: number, height: number): AnyCanvas {
    if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
}

function context(canvas: AnyCanvas) {
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) throw new Error("This browser can't process images");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    return ctx;
}

/** Draws in halving steps so a big photo shrunk to a thumbnail stays smooth instead of aliased. */
function drawScaled(bitmap: ImageBitmap, size: Size): AnyCanvas {
    let source: CanvasImageSource = bitmap;
    let width = bitmap.width;
    let height = bitmap.height;
    while (width / 2 > size.width && height / 2 > size.height) {
        width = Math.ceil(width / 2);
        height = Math.ceil(height / 2);
        const step = makeCanvas(width, height);
        context(step).drawImage(source, 0, 0, width, height);
        source = step as CanvasImageSource;
    }
    const out = makeCanvas(size.width, size.height);
    context(out).drawImage(source, 0, 0, size.width, size.height);
    return out;
}

async function toBytes(canvas: AnyCanvas, type: string, quality: number): Promise<{ bytes: Uint8Array; type: string }> {
    const blob: Blob | null =
        "convertToBlob" in canvas
            ? await canvas.convertToBlob({ type, quality })
            : await new Promise<Blob | null>((resolve) => (canvas as HTMLCanvasElement).toBlob(resolve, type, quality));
    if (!blob) throw new Error("This browser couldn't encode the image");
    return { bytes: new Uint8Array(await blob.arrayBuffer()), type: blob.type };
}

export function createBrowserEngine(): Engine {
    return {
        async decode(file, head, maxEdge): Promise<Decoded> {
            const known = displayDimensions(head);
            let bitmap: ImageBitmap;
            if (known && Math.max(known.width, known.height) > maxEdge) {
                // Decode straight at the smaller size: a 12 MP photo is never held in full.
                const target = fitWithin(known.width, known.height, maxEdge);
                bitmap = await createImageBitmap(file, { imageOrientation: "from-image", resizeWidth: target.width, resizeHeight: target.height, resizeQuality: "high" });
                // If the browser applied the rotation differently than the header says, decode in full instead.
                if (Math.abs(bitmap.width / bitmap.height - known.width / known.height) > 0.02) {
                    bitmap.close();
                    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
                }
            } else {
                bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
            }
            return { width: bitmap.width, height: bitmap.height, handle: bitmap };
        },
        encode(decoded, size, quality) {
            return toBytes(drawScaled(decoded.handle as ImageBitmap, size), "image/webp", quality);
        },
        async pixels(decoded, maxEdge) {
            const size = fitWithin(decoded.width, decoded.height, maxEdge);
            const ctx = context(drawScaled(decoded.handle as ImageBitmap, size));
            const image = ctx.getImageData(0, 0, size.width, size.height);
            return { width: size.width, height: size.height, rgba: image.data };
        },
        release(decoded) {
            (decoded.handle as ImageBitmap).close();
        },
    };
}
