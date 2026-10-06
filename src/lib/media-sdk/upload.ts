/* eslint-disable */
// @ts-nocheck
// Copied from opslin-media-sdk by scripts/sync-media-sdk.mjs. Do not edit here; edit the SDK and run the script.
import { ERROR_TEXT, MediaError, UploadLimitError } from "./errors";

export type PutInput = {
    uploadUrl: string;
    kind: "master" | "variant";
    bytes: Uint8Array;
    type: string;
    hash: string;
    thumbhash?: string;
    /** For a variant: the master's id and the width. */
    master?: string;
    width?: number;
    /** For a master: where it goes in the library, and its pixel size. */
    folder?: string;
    name?: string;
    tags?: string[];
    pixels?: { width: number; height: number };
    /** Server uploads: the API key, sent instead of a browser origin. */
    apiKey?: string;
};

export type PutResult = { id: string; key: string; created: boolean; assetId: string | null; folder: string | null; name: string | null };

const RETRIES = 2;
const RETRY_BASE_MS = 600;

type Options = { fetch: typeof fetch; signal?: AbortSignal; sleep?: (ms: number) => Promise<void> };

function endpoint(input: PutInput) {
    const params = new URLSearchParams({ kind: input.kind });
    if (input.kind === "variant") {
        params.set("master", input.master ?? "");
        params.set("w", String(input.width ?? ""));
    } else {
        if (input.folder) params.set("folder", input.folder);
        if (input.name) params.set("name", input.name);
        if (input.tags?.length) params.set("tags", input.tags.join(","));
        if (input.pixels) {
            params.set("width", String(input.pixels.width));
            params.set("height", String(input.pixels.height));
        }
    }
    return `${input.uploadUrl.replace(/\/+$/, "")}/upload?${params}`;
}

/** One object to the Worker. Retries only network failures and 5xx; a refusal (4xx) is final and explained. */
export async function putObject(input: PutInput, options: Options): Promise<PutResult> {
    const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    const headers: Record<string, string> = { "Content-Type": input.type, "X-Content-Sha256": input.hash };
    if (input.thumbhash) headers["X-Thumbhash"] = input.thumbhash;
    if (input.apiKey) headers.Authorization = `Bearer ${input.apiKey}`;

    let failure: MediaError | null = null;
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
        if (attempt > 0) await sleep(RETRY_BASE_MS * 2 ** (attempt - 1));
        let response: Response;
        try {
            response = await options.fetch(endpoint(input), { method: "PUT", headers, body: input.bytes as BodyInit, signal: options.signal });
        } catch (error) {
            if (options.signal?.aborted) throw new MediaError("aborted", "The upload was cancelled.");
            failure = new MediaError("network", "Couldn't reach the upload service. Check the connection and try again.");
            continue;
        }

        const body = (await response.json().catch(() => ({}))) as { id?: string; key?: string; created?: boolean; error?: string; scope?: string; assetId?: string; folder?: string; name?: string };
        if (response.status === 200 || response.status === 201) {
            if (!body.id || !body.key) throw new MediaError("bad_response", "The upload service answered in an unexpected way.", response.status);
            return { id: body.id, key: body.key, created: body.created !== false, assetId: body.assetId ?? null, folder: body.folder ?? null, name: body.name ?? null };
        }
        if (response.status === 429) {
            const scope = body.scope === "minute" || body.scope === "ip" || body.scope === "project" ? body.scope : "unknown";
            throw new UploadLimitError(scope, Number(response.headers.get("retry-after")) || 60);
        }
        if (response.status >= 500) {
            failure = new MediaError(body.error ?? "server", ERROR_TEXT[body.error ?? ""] ?? "The upload service had a problem. Try again.", response.status);
            continue;
        }
        const code = body.error ?? "rejected";
        throw new MediaError(code, ERROR_TEXT[code] ?? "The upload service refused this image.", response.status);
    }
    throw failure ?? new MediaError("network", "The upload failed.");
}
