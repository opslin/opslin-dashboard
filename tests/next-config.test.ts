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
});
