import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainsSection } from "../DomainsSection";
import type { ComponentProps, ReactNode } from "react";
import { api, type App, type AppDomainRecord, type AppDomainsResponse, type Server } from "@/lib/api";

vi.mock("@/lib/api", async () => {
    const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
    return { ...actual, api: { ...actual.api, addCustomDomain: vi.fn(), checkAppDomain: vi.fn(), createPreviewDomain: vi.fn() } };
});

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

    it("lists the Opslin address and custom domains with plain status pills", () => {
        renderDomains();

        expect(screen.getByRole("heading", { name: "Domains" })).toBeVisible();
        expect(screen.getByText("checkout-preview.opslin.app")).toBeVisible();
        expect(screen.getByText("Default")).toBeVisible();
        expect(screen.getByText("checkout.example.com")).toBeVisible();
        expect(screen.getByText("Active · HTTPS")).toBeVisible();
        expect(screen.getByText("2 domains")).toBeVisible();
    });

    it("does not pretend SSL pending domains are HTTPS-ready", () => {
        renderDomains({
            domainData: {
                domains: [domain({ id: "pending", status: "connected", sslStatus: "pending", primary: true })],
                primaryDomain: null,
                previewDomain: null,
            },
        });

        expect(screen.getByText("Verifying…")).toBeVisible();
        expect(screen.queryByText("Active · HTTPS")).not.toBeInTheDocument();
    });

    it("shows the DNS record from 'How to finish' for a domain still waiting on DNS", () => {
        renderDomains({
            domainData: {
                domains: [domain({ id: "waiting", domain: "shop.example.com", status: "pending_dns", sslStatus: "not_started", primary: false })],
                primaryDomain: null,
                previewDomain: null,
            },
        });

        fireEvent.click(screen.getByRole("button", { name: /How to finish/i }));
        expect(screen.getByText("Finish shop.example.com")).toBeVisible();
        expect(screen.getByText("shop")).toBeVisible();
        expect(screen.getByText("13.201.44.55")).toBeVisible();
        expect(screen.getByRole("button", { name: /Verify domain/i })).toBeVisible();
    });

    it("validates and adds a custom domain, then shows the record to create", async () => {
        vi.mocked(api.addCustomDomain).mockResolvedValue({
            domain: domain({ id: "new", domain: "shop.example.com", status: "pending_dns", sslStatus: "not_started", primary: false }),
            dnsInstructions: { type: "A", name: "shop", value: "13.201.44.55", ttl: "Auto" },
        });
        renderDomains();

        fireEvent.click(screen.getByRole("button", { name: /Add domain/i }));
        const input = screen.getByLabelText("Your domain");
        fireEvent.change(input, { target: { value: "nodots" } });
        fireEvent.submit(input.closest("form")!);
        expect(await screen.findByText(/doesn't look like a domain/i)).toBeVisible();
        expect(api.addCustomDomain).not.toHaveBeenCalled();

        fireEvent.change(input, { target: { value: "https://Shop.Example.com" } });
        fireEvent.submit(input.closest("form")!);
        await waitFor(() => expect(api.addCustomDomain).toHaveBeenCalledWith("app-1", "shop.example.com"));
        expect(await screen.findByText("Finish shop.example.com")).toBeVisible();
    });

    it("disables domain mutation surfaces while deleting", () => {
        renderDomains({ deleteLocked: true });

        expect(screen.getByText("Domain changes paused")).toBeVisible();
        expect(screen.queryByRole("button", { name: /Add domain/i })).not.toBeInTheDocument();
    });

    it("filters raw IP domain records and offers to create the free address", () => {
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
        expect(screen.getByText("Free Opslin address")).toBeVisible();
        expect(screen.getByRole("button", { name: /Create address/i })).toBeEnabled();
    });
});
