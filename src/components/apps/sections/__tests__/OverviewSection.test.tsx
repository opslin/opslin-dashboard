import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OverviewSection } from "../OverviewSection";
import type { ComponentProps } from "react";
import type { App, AppDomainRecord, AppDomainsResponse, DeploymentRecord, Server } from "@/lib/api";

vi.mock("next/link", () => ({
    default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
        <a href={href} {...props}>{children}</a>
    ),
}));

vi.mock("sonner", () => ({
    toast: {
        success: vi.fn(),
    },
}));

const app: App = {
    id: "app-1",
    name: "Checkout API",
    status: "running",
    healthStatus: "healthy",
    gitUrl: "https://github.com/acme/checkout.git",
    branch: "main",
    port: 3000,
    envVars: {},
    createdAt: "2026-01-01T00:00:00.000Z",
};

const server: Server = {
    id: "server-1",
    name: "Production VPS",
    ip: "10.0.0.10",
    publicIp: "13.201.44.55",
    status: "connected",
    isLiveConnected: true,
    createdAt: "2026-01-01T00:00:00.000Z",
};

function domain(overrides: Partial<AppDomainRecord> = {}): AppDomainRecord {
    return {
        id: "domain-1",
        domain: "checkout.example.com",
        type: "custom",
        status: "active",
        expectedIp: "13.201.44.55",
        resolvedIps: ["13.201.44.55"],
        lastCheckedAt: null,
        connectedAt: null,
        sslStatus: "active",
        primary: true,
        enabled: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        preferredUrl: "https://checkout.example.com",
        ...overrides,
    };
}

const domainData: AppDomainsResponse = {
    domains: [domain()],
    primaryDomain: "checkout.example.com",
    previewDomain: null,
};

const latestDeployment: DeploymentRecord = {
    id: "deployment-1",
    sha: "abcdef123456",
    status: "succeeded",
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:03:00.000Z",
    triggeredBy: "manual",
    triggerMeta: {},
};

function renderOverview(overrides: Partial<ComponentProps<typeof OverviewSection>> = {}) {
    const props: ComponentProps<typeof OverviewSection> = {
        app,
        server,
        domainData,
        domainsLoading: false,
        latestDeployment,
        rollbackTarget: null,
        deployErrorClassification: null,
        deployErrorRaw: null,
        deleteFailureReason: null,
        deployPending: false,
        rollbackPending: false,
        deletePending: false,
        deleteLocked: false,
        onDeploy: vi.fn(),
        onViewLogs: vi.fn(),
        onRollback: vi.fn(),
        onRetryDeleteCleanup: vi.fn(),
        ...overrides,
    };

    return {
        props,
        ...render(<OverviewSection {...props} />),
    };
}

describe("OverviewSection", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders the primary URL card and latest deployment summary", () => {
        renderOverview();

        expect(screen.getByRole("link", { name: "https://checkout.example.com" })).toBeVisible();
        expect(screen.getByText("abcdef1")).toBeVisible();
        expect(screen.getByText("SUCCEEDED")).toBeVisible();
        expect(screen.getByText("Agent live")).toBeVisible();
    });

    it("does not show a raw IP as the primary app URL", () => {
        renderOverview({
            domainData: {
                domains: [
                    domain({
                        id: "raw-ip",
                        domain: "13.201.44.55",
                        preferredUrl: "https://13.201.44.55",
                    }),
                ],
                primaryDomain: null,
                previewDomain: null,
            },
        });

        expect(screen.queryByText(/13\.201\.44\.55/)).not.toBeInTheDocument();
        expect(screen.getByText("No URL available yet")).toBeVisible();
    });

    it("shows delete lifecycle state", () => {
        renderOverview({
            app: { ...app, status: "delete_failed", deployLogs: "cleanup failed" },
            deleteLocked: true,
            deleteFailureReason: "cleanup failed",
        });

        expect(screen.getByText("Delete cleanup failed")).toBeVisible();
        expect(screen.getByText("cleanup failed")).toBeVisible();
    });

    it("has a View Logs shortcut without fetching logs itself", () => {
        const onViewLogs = vi.fn();
        renderOverview({ onViewLogs });

        fireEvent.click(screen.getByRole("button", { name: /View Logs/i }));
        expect(onViewLogs).toHaveBeenCalledTimes(1);
    });

    it("app shows Running when HTTP works but SSL failed", () => {
        renderOverview({
            app: { ...app, status: "running", port: 3000 },
            domainData: {
                domains: [
                    domain({
                        status: "connected",
                        sslStatus: "failed",
                        preferredUrl: "http://checkout.example.com",
                        httpUrl: "http://checkout.example.com",
                        errorMessage: "Certificate issue failed.",
                        sslFailureAction: "Retry SSL after DNS settles.",
                    }),
                ],
                primaryDomain: "checkout.example.com",
                previewDomain: null,
            },
        });

        const runningBadges = screen.getAllByText("Running");
        expect(runningBadges.some((badge) => badge.className.includes("bg-green-100"))).toBe(true);
        expect(screen.getByText("SSL Status")).toBeVisible();
        expect(screen.getByText("SSL Failed")).toBeVisible();
        expect(screen.getByText("Retry SSL after DNS settles.")).toBeVisible();
        expect(screen.getByText("HTTP Live")).toBeVisible();
        expect(screen.getByText("HTTPS Not Ready")).toBeVisible();
    });
});
