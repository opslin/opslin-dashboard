import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DomainStatusDetail } from "../DomainStatusDetail";
import type { AppDomainRecord } from "@/lib/api";

function domain(overrides: Partial<AppDomainRecord> = {}): AppDomainRecord {
    return {
        id: "domain-1",
        domain: "img.agnixstudio.in",
        type: "custom",
        status: "connected",
        expectedIp: "3.110.182.212",
        resolvedIps: ["3.110.182.212"],
        lastCheckedAt: null,
        connectedAt: null,
        sslStatus: "pending",
        primary: true,
        enabled: true,
        createdAt: new Date().toISOString(),
        errorMessage: null,
        httpUrl: "http://img.agnixstudio.in",
        httpsUrl: "https://img.agnixstudio.in",
        preferredUrl: "http://img.agnixstudio.in",
        canRetrySsl: true,
        ...overrides,
    };
}

describe("DomainStatusDetail", () => {
    it("shows HTTP access and SSL pending when DNS is connected but SSL is not active", () => {
        render(<DomainStatusDetail domain={domain()} onRetrySsl={vi.fn()} />);

        expect(screen.getByText("DNS Status")).toBeVisible();
        expect(screen.getByText("✅ Connected")).toBeVisible();
        expect(screen.getByText("HTTP Status")).toBeVisible();
        expect(screen.getByText("✅ Route active")).toBeVisible();
        expect(screen.getByText("SSL Status")).toBeVisible();
        expect(screen.getByText("⏳ Pending")).toBeVisible();
        expect(screen.getByText("HTTPS Status")).toBeVisible();
        expect(screen.getByText("⬜ Not ready")).toBeVisible();
        expect(screen.getByRole("link", { name: /open http/i })).toHaveAttribute("href", "http://img.agnixstudio.in");
        expect(screen.getByRole("button", { name: /retry ssl/i })).toBeVisible();
    });

    it("shows HTTPS ready and opens HTTPS only when sslStatus is active", () => {
        render(<DomainStatusDetail domain={domain({
            status: "active",
            sslStatus: "active",
            preferredUrl: "https://img.agnixstudio.in",
        })} />);

        expect(screen.getByText("✅ Active")).toBeVisible();
        expect(screen.getByText("✅ Ready")).toBeVisible();
        expect(screen.getByRole("link", { name: /open https/i })).toHaveAttribute("href", "https://img.agnixstudio.in");
        expect(screen.queryByRole("button", { name: /retry ssl/i })).not.toBeInTheDocument();
    });

    it("shows SSL failed state and retry action without raw logs", () => {
        render(<DomainStatusDetail domain={domain({
            sslStatus: "failed",
            errorMessage: "SSL issuance failed. Check DNS, port 80/443 access, and Let’s Encrypt configuration.",
        })} onRetrySsl={vi.fn()} />);

        expect(screen.getAllByText("❌ Failed").length).toBeGreaterThan(0);
        expect(screen.getByText(/SSL issuance failed/i)).toBeVisible();
        expect(screen.getByRole("button", { name: /retry ssl/i })).toBeVisible();
    });

    it("shows HTTP live when connected but SSL failed", () => {
        const { container } = render(<DomainStatusDetail domain={domain({
            status: "connected",
            sslStatus: "failed",
            errorMessage: "SSL issuance failed.",
        })} onRetrySsl={vi.fn()} />);

        expect(screen.getByText("HTTP Status")).toBeVisible();
        expect(screen.getByText("✅ Route active")).toBeVisible();
        expect(screen.getByText(/HTTP is available now/i)).toBeVisible();
        expect(screen.getByRole("link", { name: /open http/i })).toHaveAttribute("href", "http://img.agnixstudio.in");
        expect(container.querySelector(".rounded-xl")?.className).not.toContain("bg-red-50");
    });

    it("shows exact SSL failure action", () => {
        render(<DomainStatusDetail domain={domain({
            sslStatus: "failed",
            sslFailureAction: "Open port 80 and retry certificate issuance.",
        })} onRetrySsl={vi.fn()} />);

        expect(screen.getByText("Open port 80 and retry certificate issuance.")).toBeVisible();
    });

    it("shows retry button only when retryable", () => {
        render(<DomainStatusDetail domain={domain({
            sslStatus: "failed",
            canRetrySsl: false,
        })} onRetrySsl={vi.fn()} />);

        expect(screen.queryByRole("button", { name: /retry ssl/i })).not.toBeInTheDocument();
    });

    it("shows operator guidance when Let’s Encrypt is not configured", () => {
        render(<DomainStatusDetail domain={domain({
            sslStatus: "not_configured",
            errorMessage: "Let’s Encrypt is not enabled. Set LETSENCRYPT_ENABLED=true and LETSENCRYPT_EMAIL on the API.",
            sslFailureAction: "Admin configuration required: set LETSENCRYPT_ENABLED=true and LETSENCRYPT_EMAIL on the API.",
            canRetrySsl: false,
        })} onRetrySsl={vi.fn()} />);

        expect(screen.getByText("⚠️ Not configured")).toBeVisible();
        expect(screen.getAllByText(/Admin configuration required/i).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/LETSENCRYPT_ENABLED=true/i).length).toBeGreaterThan(0);
        expect(screen.queryByRole("button", { name: /retry ssl/i })).not.toBeInTheDocument();
    });
});
