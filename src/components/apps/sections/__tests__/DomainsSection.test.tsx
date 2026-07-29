import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainsSection } from "../DomainsSection";
import type { ComponentProps, ReactNode } from "react";
import type { App, AppDomainRecord, AppDomainsResponse, Server } from "@/lib/api";

vi.mock("next/link", () => ({
    default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
        <a href={href} {...props}>{children}</a>
    ),
}));

vi.mock("sonner", () => ({
    toast: {
        error: vi.fn(),
        success: vi.fn(),
    },
}));

vi.mock("@/components/PlanGate", () => ({
    PlanGate: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/UpgradePrompt", () => ({
    UpgradePrompt: () => <div data-testid="upgrade-prompt">Upgrade</div>,
}));

const app: App = {
    id: "app-1",
    name: "Checkout API",
    status: "running",
    domain: "checkout.example.com",
    gitUrl: "https://github.com/acme/checkout.git",
    branch: "main",
    port: 3000,
    envVars: {},
    publicStatus: false,
    createdAt: "2026-01-01T00:00:00.000Z",
};

const server: Pick<Server, "id" | "name" | "ip" | "publicIp" | "hostname"> = {
    id: "server-1",
    name: "Production VPS",
    ip: "10.0.0.10",
    publicIp: "13.201.44.55",
    hostname: "prod-vps",
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
    domains: [
        domain({
            id: "preview-domain",
            domain: "checkout-preview.opslin.app",
            type: "preview",
            status: "active",
            sslStatus: "active",
            primary: false,
            preferredUrl: "https://checkout-preview.opslin.app",
        }),
        domain(),
    ],
    primaryDomain: "checkout.example.com",
    previewDomain: "checkout-preview.opslin.app",
};

function renderDomains(overrides: Partial<ComponentProps<typeof DomainsSection>> = {}) {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
    const props: ComponentProps<typeof DomainsSection> = {
        app,
        server,
        appId: app.id,
        domainData,
        domainsLoading: false,
        access: {
            url: "https://checkout.example.com",
            label: "checkout.example.com",
            scope: "custom domain",
            help: "Public URL",
        },
        missingAccessTitle: "No URL available",
        missingAccessHelp: "Configure a domain.",
        missingAccessAction: "Add a domain",
        domainValue: "checkout.example.com",
        onDomainChange: vi.fn(),
        onSaveDomain: vi.fn(),
        isSavingDomain: false,
        publicIpValue: "13.201.44.55",
        onPublicIpChange: vi.fn(),
        onSavePublicIp: vi.fn(),
        isSavingPublicIp: false,
        domainCheck: null,
        deleteLocked: false,
        ...overrides,
    };

    return {
        props,
        ...render(
            <QueryClientProvider client={queryClient}>
                <DomainsSection {...props} />
            </QueryClientProvider>
        ),
    };
}

describe("DomainsSection", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.assign(navigator, {
            clipboard: {
                writeText: vi.fn(),
            },
        });
    });

    it("renders preview fallback and custom domains table", () => {
        renderDomains();

        expect(screen.getByText("Temporary URL fallback")).toBeVisible();
        expect(screen.getByText("Custom Domains")).toBeVisible();
        expect(screen.getAllByText("checkout.example.com").length).toBeGreaterThan(0);
        expect(screen.getByLabelText("Open checkout.example.com")).toHaveAttribute("href", "https://checkout.example.com");
    });

    it("does not pretend SSL pending domains are HTTPS-ready", () => {
        renderDomains({
            domainData: {
                domains: [
                    domain({
                        id: "preview-pending",
                        domain: "checkout-preview.opslin.app",
                        type: "preview",
                        status: "connected",
                        sslStatus: "pending",
                        primary: true,
                        preferredUrl: "http://checkout-preview.opslin.app",
                    }),
                ],
                primaryDomain: null,
                previewDomain: "checkout-preview.opslin.app",
            },
        });

        expect(screen.getByRole("link", { name: "http://checkout-preview.opslin.app" })).toBeVisible();
        expect(screen.getAllByText("Open HTTP").length).toBeGreaterThan(0);
        expect(screen.queryByText("Open HTTPS")).not.toBeInTheDocument();
        expect(screen.getByText("HTTP is available now. HTTPS will be used after SSL is active.")).toBeVisible();
    });

    it("shows HTTPS actions only for SSL-active domains", () => {
        renderDomains({
            domainData: {
                domains: [
                    domain({
                        id: "preview-active",
                        domain: "checkout-preview.opslin.app",
                        type: "preview",
                        status: "active",
                        sslStatus: "active",
                        primary: true,
                        preferredUrl: "https://checkout-preview.opslin.app",
                    }),
                ],
                primaryDomain: null,
                previewDomain: "checkout-preview.opslin.app",
            },
        });

        expect(screen.getByRole("link", { name: "https://checkout-preview.opslin.app" })).toBeVisible();
        expect(screen.getAllByText("Open HTTPS").length).toBeGreaterThan(0);
    });

    it("disables domain mutation surfaces while deleting", () => {
        renderDomains({ deleteLocked: true });

        expect(screen.getByText("Domain changes paused")).toBeVisible();
        expect(screen.queryByText("Add Custom Domain")).not.toBeInTheDocument();
        expect(screen.queryByText("Check Connection")).not.toBeInTheDocument();
    });

    it("filters raw IP domain records from URL surfaces", () => {
        renderDomains({
            app: { ...app, domain: undefined },
            server: { ...server, publicIp: null },
            publicIpValue: "",
            access: null,
            domainValue: "",
            domainData: {
                domains: [
                    domain({
                        id: "raw-ip",
                        domain: "13.201.44.55",
                        type: "preview",
                        expectedIp: null,
                        resolvedIps: [],
                        preferredUrl: "https://13.201.44.55",
                    }),
                ],
                primaryDomain: null,
                previewDomain: null,
            },
        });

        expect(screen.queryByText(/13\.201\.44\.55/)).not.toBeInTheDocument();
        expect(screen.getByText("Temporary URL not created yet.")).toBeVisible();
    });
});
