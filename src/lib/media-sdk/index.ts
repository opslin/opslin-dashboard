/* eslint-disable */
// @ts-nocheck
// Copied from opslin-media-sdk by scripts/sync-media-sdk.mjs. Do not edit here; edit the SDK and run the script.
export { createMedia } from "./media";
export type { Media, MediaConfig, UploadedImage, UploadOptions, UploadProgress } from "./media";
export { MediaError, UploadLimitError } from "./errors";
export { LADDER, MASTER_MAX_EDGE, planSizes } from "./plan";
export { imageSrc, imageSrcset, masterUrl, snapWidth, variantUrl } from "./urls";
export { averageColorCss, rgbaToThumbHash, thumbHashToAverageColor } from "./thumbhash";
export { createBrowserEngine } from "./engine-browser";
export type { Decoded, Engine } from "./engine";
