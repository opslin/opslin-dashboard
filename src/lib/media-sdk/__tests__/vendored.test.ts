// The SDK is copied into the dashboard by scripts/sync-media-sdk.mjs. Next.js resolves the copied files only without
// ".js" import endings, so a copy that still has them (or is stale) breaks the Media page at build time.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = readdirSync(dir).filter((name) => name.endsWith(".ts"));

describe("vendored Media SDK", () => {
    it("has the SDK's files and marks them as copies", () => {
        expect(files.sort()).toEqual(["dimensions.ts", "engine-browser.ts", "engine.ts", "errors.ts", "hash.ts", "index.ts", "media.ts", "plan.ts", "thumbhash.ts", "upload.ts", "urls.ts"]);
        for (const name of files) expect(readFileSync(join(dir, name), "utf8")).toContain("scripts/sync-media-sdk.mjs");
    });

    it("uses import paths Next.js can resolve (no .js endings)", () => {
        for (const name of files) {
            const source = readFileSync(join(dir, name), "utf8");
            expect(source, name).not.toMatch(/from\s+["']\.\/[^"']+\.js["']/);
        }
    });

    it("works end to end with the real code (not mocked)", async () => {
        const { createMedia } = await import("../index");
        const calls: string[] = [];
        const media = createMedia({
            uploadUrl: "https://up.acme.workers.dev",
            imageUrl: "https://img.acme.com",
            sleep: async () => undefined,
            engine: {
                decode: async () => ({ width: 800, height: 600, handle: {} }),
                encode: async (_d, size) => ({ bytes: Uint8Array.from([0x52, 0x49, 0x46, 0x46, size.width & 255, 1, 2, 3]), type: "image/webp" }),
                pixels: async () => ({ width: 1, height: 1, rgba: new Uint8ClampedArray([10, 20, 30, 255]) }),
                release: () => undefined,
            },
            fetch: (async (input: string | URL | Request) => {
                const url = new URL(String(input));
                calls.push(`${url.searchParams.get("kind")}:${url.searchParams.get("folder") ?? ""}`);
                return new Response(JSON.stringify({ id: "a".repeat(64), key: "k", created: true, assetId: "id", folder: url.searchParams.get("folder") ?? "", name: "n" }), { status: 201 });
            }) as typeof fetch,
        });
        const image = await media.upload(new File([new Uint8Array(5)], "photo.jpg", { type: "image/jpeg" }), { folder: "products" });
        expect(image.folder).toBe("products");
        expect(calls[0]).toBe("master:products");
        expect(calls.length).toBe(3);
    });
});
