import { describe, expect, it } from "vitest";
import { formatBytes, formatCount, parseWebsite, sdkSnippet } from "../media-format";

describe("formatBytes", () => {
    it.each([
        [0, "0 B"],
        [-5, "0 B"],
        [Number.NaN, "0 B"],
        [512, "512 B"],
        [1024, "1 KB"],
        [1536, "1.5 KB"],
        [12.4 * 1024 * 1024, "12.4 MB"],
        [250 * 1024 * 1024, "250 MB"],
        [10 * 1024 ** 3, "10 GB"],
        [5 * 1024 ** 4, "5 TB"],
        [9000 * 1024 ** 4, "9000 TB"],
    ])("%s → %s", (value, text) => {
        expect(formatBytes(value)).toBe(text);
    });
});

describe("formatCount", () => {
    it("groups thousands", () => {
        expect(formatCount(20000)).toBe("20,000");
        expect(formatCount(7)).toBe("7");
    });
});

describe("parseWebsite", () => {
    it("normalizes to a bare origin and adds https when missing", () => {
        expect(parseWebsite("Shop.Example.com/some/path?x=1", [])).toEqual({ ok: true, origin: "https://shop.example.com" });
        expect(parseWebsite("  https://shop.example.com/ ", [])).toEqual({ ok: true, origin: "https://shop.example.com" });
        expect(parseWebsite("http://localhost:3000/app", [])).toEqual({ ok: true, origin: "http://localhost:3000" });
    });

    it.each([
        ["", /Enter a website/],
        ["not a host name", /valid website/],
        ["http://shop.example.com", /https/],
        ["ftp://shop.example.com", /https/],
        ["https://user:pw@shop.example.com", /valid website/],
    ])("rejects %j", (value, reason) => {
        const result = parseWebsite(value, []);
        expect(result.ok).toBe(false);
        expect(!result.ok && result.reason).toMatch(reason);
    });

    it("rejects duplicates and more than 20", () => {
        expect(parseWebsite("https://a.example.com", ["https://a.example.com"])).toMatchObject({ ok: false, reason: expect.stringMatching(/already/) });
        const many = Array.from({ length: 20 }, (_, i) => `https://s${i}.example.com`);
        expect(parseWebsite("https://new.example.com", many)).toMatchObject({ ok: false, reason: expect.stringMatching(/up to 20/) });
    });
});

describe("sdkSnippet", () => {
    it("fills in this project's two addresses and nothing secret", () => {
        const code = sdkSnippet({ uploadUrl: "https://up.acme.workers.dev", imageUrl: "https://img.acme.com" });
        expect(code).toContain('uploadUrl: "https://up.acme.workers.dev"');
        expect(code).toContain('imageUrl: "https://img.acme.com"');
        expect(code).toContain("media.upload(file");
    });
});
