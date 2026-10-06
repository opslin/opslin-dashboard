/* eslint-disable */
// @ts-nocheck
// Copied from opslin-media-sdk by scripts/sync-media-sdk.mjs. Do not edit here; edit the SDK and run the script.
import { LADDER } from "./plan";

const ID = /^[0-9a-f]{64}$/;

function base(imageUrl: string) {
    return imageUrl.replace(/\/+$/, "");
}

function check(id: string) {
    if (!ID.test(id)) throw new TypeError("Invalid image id");
    return id;
}

/** The pre-made width that serves a wanted width best: the smallest one that is at least as wide, else the largest. */
export function snapWidth(wanted: number, widths: readonly number[] = LADDER): number {
    const sorted = [...widths].sort((a, b) => a - b);
    return sorted.find((w) => w >= wanted) ?? sorted[sorted.length - 1] ?? wanted;
}

export function masterUrl(imageUrl: string, id: string) {
    return `${base(imageUrl)}/masters/${check(id).slice(0, 2)}/${id}`;
}

export function variantUrl(imageUrl: string, id: string, width: number) {
    return `${base(imageUrl)}/v/${check(id).slice(0, 2)}/${id}/w${width}.webp`;
}

/** A URL for about `width` CSS pixels (pass pixels already multiplied by the device pixel ratio). */
export function imageSrc(imageUrl: string, id: string, width?: number, widths: readonly number[] = LADDER) {
    if (!width || widths.length === 0) return masterUrl(imageUrl, id);
    return variantUrl(imageUrl, id, snapWidth(width, widths));
}

/** `srcset` text for the pre-made widths. */
export function imageSrcset(imageUrl: string, id: string, widths: readonly number[] = LADDER) {
    return [...widths].sort((a, b) => a - b).map((w) => `${variantUrl(imageUrl, id, w)} ${w}w`).join(", ");
}
