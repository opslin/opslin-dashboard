import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppHeader } from "../AppHeader";
import type { App } from "@/lib/api";

// The terminal itself needs a browser WebSocket and xterm; the header only decides whether to offer it.
vi.mock("@/components/apps/app-terminal-sheet", () => ({
    AppTerminalSheet: ({ open, appName }: { open: boolean; appName: string }) => (open ? <div role="dialog">Terminal in {appName}</div> : null),
}));

vi.mock("next/link", () => ({
    default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
        <a href={href} {...props}>{children}</a>
    ),
}));

function app(overrides: Partial<Pick<App, "name" | "status" | "deployLogs">> = {}) {
    return {
        id: "app-1",
        createdAt: "2026-10-26T00:00:00.000Z",
        name: "Checkout API",
        status: "stopped" as App["status"],
        deployLogs: null,
        ...overrides,
    };
}

function renderHeader(overrides: Partial<React.ComponentProps<typeof AppHeader>> = {}) {
    const props: React.ComponentProps<typeof AppHeader> = {
        app: app(),
        server: { id: "server-1", name: "Production VPS" },
        deleteFailureReason: null,
        deployPending: false,
        stopPending: false,
        deletePending: false,
        onDeploy: vi.fn(),
        onStop: vi.fn(),
        onDelete: vi.fn(),
        onRetryDeleteCleanup: vi.fn(),
        ...overrides,
    };

    return {
        props,
        ...render(<AppHeader {...props} />),
    };
}

async function openMenu() {
    const trigger = screen.getByRole("button", { name: "More app actions" });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
    await screen.findByRole("menu");
}

describe("AppHeader", () => {
    it("renders app name, server, status, and a deploy action when allowed", () => {
        const onDeploy = vi.fn();
        renderHeader({ onDeploy });

        expect(screen.getByRole("heading", { name: "Checkout API" })).toBeVisible();
        expect(screen.getByRole("link", { name: "Production VPS" })).toBeVisible();
        expect(screen.getByText("Stopped")).toBeVisible();

        const deployButton = screen.getByRole("button", { name: /Deploy/i });
        expect(deployButton).toBeEnabled();
        fireEvent.click(deployButton);
        expect(onDeploy).toHaveBeenCalledTimes(1);
    });

    it("disables dangerous actions while deleting", async () => {
        renderHeader({ app: app({ status: "deleting" }) });

        expect(screen.getByRole("button", { name: /Deleting/i })).toBeDisabled();
        await openMenu();
        expect(screen.getByRole("menuitem", { name: /Delete app/i })).toHaveAttribute("aria-disabled", "true");
        expect(screen.getByText("Deleting app")).toBeVisible();
    });

    it("keeps the delete_failed retry surface available", async () => {
        const onRetryDeleteCleanup = vi.fn();
        renderHeader({
            app: app({ status: "delete_failed", deployLogs: "cleanup failed" }),
            deleteFailureReason: "cleanup failed",
            onRetryDeleteCleanup,
        });

        expect(screen.getByText("Delete cleanup failed")).toBeVisible();
        const retryButton = screen.getByRole("button", { name: "Retry Cleanup" });
        expect(retryButton).toBeEnabled();
        fireEvent.click(retryButton);
        expect(onRetryDeleteCleanup).toHaveBeenCalledTimes(1);
        await openMenu();
        expect(screen.getByRole("menuitem", { name: /Delete app/i })).toHaveAttribute("aria-disabled", "true");
    });

    describe("terminal inside the app", () => {
        const marketplace = { slug: "open-webui", name: "Open WebUI", image: "ghcr.io/open-webui/open-webui:v0.12.4", pinnedImage: null, repository: "https://github.com/open-webui/open-webui" };

        it("is offered for a running Marketplace app and opens the panel", async () => {
            renderHeader({ app: { ...app({ status: "running" }), marketplace } as never });
            await openMenu();
            fireEvent.click(screen.getByRole("menuitem", { name: /Open terminal/i }));
            expect(await screen.findByRole("dialog")).toHaveTextContent("Terminal in Checkout API");
        });

        it("is not offered for an app that is not from the Marketplace, or one that is not running", async () => {
            const first = renderHeader({ app: app({ status: "running" }) });
            await openMenu();
            expect(screen.queryByRole("menuitem", { name: /Open terminal/i })).toBeNull();
            first.unmount();
            renderHeader({ app: { ...app({ status: "stopped" }), marketplace } as never });
            await openMenu();
            expect(screen.queryByRole("menuitem", { name: /Open terminal/i })).toBeNull();
        });
    });
});
