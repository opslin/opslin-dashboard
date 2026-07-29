import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { AppPrimaryUrlCard } from "../AppPrimaryUrlCard";
import type { App, AppDomainRecord, AppDomainsResponse } from "@/lib/api";

vi.mock("sonner", () => ({
    toast: {
        success: vi.fn(),
    },
}));

const clipboardWriteText = vi.fn();

function domain(overrides: Partial<AppDomainRecord> = {}): AppDomainRecord {
    return {
        id: "domain-1",
        domain: "app.example.com",
        type: "custom",
        status: "connected",
        expectedIp: "13.201.44.55",
        resolvedIps: ["13.201.44.55"],
        lastCheckedAt: null,
        connectedAt: null,
        sslStatus: "pending",
        primary: false,
        enabled: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        ...overrides,
    };
}

function domainResponse(domains: AppDomainRecord[], overrides: Partial<AppDomainsResponse> = {}): AppDomainsResponse {
    return {
        domains,
        primaryDomain: null,
        previewDomain: null,
        ...overrides,
    };
}

const runningApp: Pick<App, "status" | "port"> = {
    status: "running",
    port: 3000,
};

describe("AppPrimaryUrlCard", () => {
    beforeEach(() => {
        clipboardWriteText.mockReset();
        clipboardWriteText.mockResolvedValue(undefined);
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: { writeText: clipboardWriteText },
        });
    });

    it("shows the preferred URL from an active custom domain", async () => {
        const customDomain = domain({
            domain: "app.example.com",
            status: "active",
            sslStatus: "active",
            preferredUrl: "https://app.example.com",
        });
        const previewDomain = domain({
            id: "preview-1",
            domain: "smoke.opslin.app",
            type: "preview",
            status: "active",
            sslStatus: "active",
            preferredUrl: "https://smoke.opslin.app",
        });

        render(
            <AppPrimaryUrlCard
                domainData={domainResponse([previewDomain, customDomain])}
                domainsLoading={false}
            />
        );

        expect(screen.getByText("Primary URL")).toBeVisible();
        expect(screen.getByRole("link", { name: "https://app.example.com" })).toHaveAttribute("href", "https://app.example.com");
        expect(screen.getByText("HTTPS Live")).toBeVisible();

        fireEvent.click(screen.getByRole("button", { name: /Copy/i }));
        await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledWith("https://app.example.com"));
    });

    it("falls back to the preview domain when no custom domain is active", () => {
        const previewDomain = domain({
            id: "preview-1",
            domain: "smoke.opslin.app",
            type: "preview",
            status: "pending_dns",
            sslStatus: "pending",
            httpUrl: "http://smoke.opslin.app",
        });

        render(
            <AppPrimaryUrlCard
                domainData={domainResponse([previewDomain], { previewDomain: "smoke.opslin.app" })}
                domainsLoading={false}
            />
        );

        expect(screen.getByText("Temporary URL")).toBeVisible();
        expect(screen.getByRole("link", { name: "http://smoke.opslin.app" })).toHaveAttribute("href", "http://smoke.opslin.app");
    });

    it("never shows a raw IP as the app URL", () => {
        const rawIpDomain = domain({
            id: "raw-ip",
            domain: "3.110.182.212",
            status: "active",
            sslStatus: "active",
            preferredUrl: "https://3.110.182.212",
        });
        const previewDomain = domain({
            id: "preview-1",
            domain: "smoke.opslin.app",
            type: "preview",
            status: "active",
            sslStatus: "active",
            preferredUrl: "https://smoke.opslin.app",
        });

        render(
            <AppPrimaryUrlCard
                domainData={domainResponse([rawIpDomain, previewDomain], { previewDomain: "smoke.opslin.app" })}
                domainsLoading={false}
            />
        );

        expect(screen.queryByText(/3\.110\.182\.212/)).not.toBeInTheDocument();
        expect(screen.getByRole("link", { name: "https://smoke.opslin.app" })).toBeVisible();
    });

    it("shows the HTTPS badge only when sslStatus is active", () => {
        const pendingDomain = domain({
            domain: "app.example.com",
            status: "connected",
            sslStatus: "pending",
            preferredUrl: "https://app.example.com",
        });

        render(
            <AppPrimaryUrlCard
                app={runningApp}
                domainData={domainResponse([pendingDomain])}
                domainsLoading={false}
            />
        );

        expect(screen.queryByText("HTTPS Live")).not.toBeInTheDocument();
        expect(screen.getByText("HTTP Live")).toBeVisible();
        expect(screen.getByText("HTTPS Not Ready")).toBeVisible();
        expect(screen.getByText("Your app is accessible over HTTP. HTTPS will be available after SSL setup.")).toBeVisible();
        expect(screen.getByRole("link", { name: "http://app.example.com" })).toHaveAttribute("href", "http://app.example.com");
        expect(screen.getByRole("link", { name: /Open HTTP/i })).toHaveAttribute("href", "http://app.example.com");
    });

    it("shows an empty state when no domain can be displayed", () => {
        render(
            <AppPrimaryUrlCard
                domainData={domainResponse([])}
                domainsLoading={false}
            />
        );

        expect(screen.getByText("No URL available yet")).toBeVisible();
    });
});
