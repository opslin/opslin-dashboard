import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("dashboard security headers", () => {
    it("allows Razorpay checkout scripts without weakening CSP", async () => {
        const headers = await nextConfig.headers?.();
        const csp = headers
            ?.flatMap((entry) => entry.headers)
            .find((header) => header.key === "Content-Security-Policy")
            ?.value;

        expect(csp).toContain("script-src");
        expect(csp).toContain("script-src-elem");
        expect(csp).toContain("connect-src");
        expect(csp).toContain("https://checkout.razorpay.com");
        expect(csp).toContain("https://cdn.razorpay.com");
        expect(csp).toContain("https://lumberjack.razorpay.com");
        expect(csp).not.toContain("script-src *");
        expect(csp).not.toContain("script-src-elem *");
        expect(csp).not.toContain("connect-src *");
    });

    it("gives only the Storage > Media page the wider connect-src, and every other page the narrow one", async () => {
        const headers = (await nextConfig.headers?.()) ?? [];
        const cspFor = (source: string) => headers
            .find((entry) => entry.source === source)
            ?.headers.find((header) => header.key === "Content-Security-Policy")?.value;
        expect(cspFor("/storage/media")).toMatch(/connect-src[^;]* https:/);
        const catchAll = headers.find((entry) => entry.source.startsWith("/((?!"));
        expect(catchAll?.source).toContain("storage/media$");
        expect(catchAll?.headers.find((header) => header.key === "Content-Security-Policy")?.value).not.toMatch(/connect-src[^;]* https:(;| )/);
    });
});

describe("Storage section redirects", () => {
    it("keeps the old Backups and Media addresses working", async () => {
        const redirects = (await nextConfig.redirects?.()) ?? [];
        const find = (source: string) => redirects.find((entry) => entry.source === source && !("has" in entry && entry.has));
        expect(find("/backups")).toMatchObject({ destination: "/storage/backups", permanent: false });
        expect(find("/media")).toMatchObject({ destination: "/storage/media", permanent: false });
    });
});
