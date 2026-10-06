/* eslint-disable */
// @ts-nocheck
// Copied from opslin-media-sdk by scripts/sync-media-sdk.mjs. Do not edit here; edit the SDK and run the script.
/** Base class: `code` is stable and safe to branch on; `message` is plain language for a person. */
export class MediaError extends Error {
    constructor(
        public readonly code: string,
        message: string,
        public readonly status?: number,
    ) {
        super(message);
        this.name = "MediaError";
    }
}

/** The upload service's daily or burst cap was hit. Try again after `retryAfterSeconds`. */
export class UploadLimitError extends MediaError {
    constructor(
        public readonly scope: "minute" | "ip" | "project" | "unknown",
        public readonly retryAfterSeconds: number,
    ) {
        super("upload_limit_reached", scope === "minute" ? "Too many uploads at once. Wait a minute and try again." : "The upload limit for today is reached. Try again later.", 429);
        this.name = "UploadLimitError";
    }
}

export const ERROR_TEXT: Record<string, string> = {
    origin_not_allowed: "This website is not allowed to upload. Add it in Opslin Media.",
    too_large: "The image is too large to upload.",
    unsupported_type: "Only JPEG, PNG, WebP and AVIF images can be uploaded.",
    animated_not_allowed: "Animated images can't be uploaded.",
    type_mismatch: "The file type doesn't match its content.",
    limits_unavailable: "The upload service is busy. Try again in a moment.",
    library_unavailable: "The library is busy. Try again in a moment.",
    bad_folder: "That folder name isn't allowed. Use letters, numbers, spaces, - _ and . (up to 8 levels).",
    bad_name: "That name isn't allowed (1 to 120 characters).",
    bad_tags: "Tags can use letters, numbers, spaces, - and _ (up to 20 tags).",
    bad_size: "The image size isn't valid.",
    not_found: "That item no longer exists.",
    folder_exists: "A folder with that name already exists.",
    not_empty: "The folder isn't empty.",
    already_in_folder: "That image is already in the folder.",
    unauthorized: "The API key isn't accepted.",
};
