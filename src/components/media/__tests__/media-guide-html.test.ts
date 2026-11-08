import { describe, expect, it } from "vitest";
import { htmlSnippet } from "@/components/media/media-guide";
import type { MediaAsset } from "@/lib/api";

const asset = (over: Partial<MediaAsset> = {}): MediaAsset => ({
    id: "a1", hash: "h", name: 'Red "shoe" <new>', folder: "", tags: [], type: "image/webp", bytes: 1, width: 1600, height: 900,
    thumbhash: null, widths: [320, 640, 1080], variantBytes: 0, createdAt: "", updatedAt: "",
    urls: { master: "https://img.example.com/masters/ab/abc", variants: { "320": "https://img.example.com/v/ab/abc/w320.webp", "640": "https://img.example.com/v/ab/abc/w640.webp", "1080": "https://img.example.com/v/ab/abc/w1080.webp" } },
    ...over,
});

describe("htmlSnippet", () => {
    it("gives a responsive <img> from the image's real addresses", () => {
        const html = htmlSnippet(asset())!;
        expect(html).toContain('src="https://img.example.com/v/ab/abc/w640.webp"');
        expect(html).toContain("w320.webp 320w, https://img.example.com/v/ab/abc/w640.webp 640w, https://img.example.com/v/ab/abc/w1080.webp 1080w");
        expect(html).toContain('width="1600" height="900"');
        expect(html).toContain('loading="lazy"');
    });

    it("escapes the name so a quote or tag in it cannot break the attribute", () => {
        expect(htmlSnippet(asset())).toContain('alt="Red &quot;shoe&quot; &lt;new>"');
    });

    it("falls back to the master when no sizes exist, and returns null when the image has no address", () => {
        const html = htmlSnippet(asset({ widths: [], width: null, height: null, urls: { master: "https://img.example.com/m", variants: {} } }))!;
        expect(html).toContain('src="https://img.example.com/m"');
        expect(html).not.toContain("srcset");
        expect(html).not.toContain("width=");
        expect(htmlSnippet(asset({ urls: null }))).toBeNull();
    });
});
