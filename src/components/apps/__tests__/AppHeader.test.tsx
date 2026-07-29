import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppHeader } from "../AppHeader";
import type { App } from "@/lib/api";

vi.mock("next/link", () => ({
    default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
        <a href={href} {...props}>{children}</a>
    ),
}));

function app(overrides: Partial<Pick<App, "name" | "status" | "deployLogs">> = {}) {
    return {
        name: "Checkout API",
        status: "stopped" as App["status"],
        deployLogs: null,
        ...overrides,
    };
}

function renderHeader(overrides: Partial<React.ComponentProps<typeof AppHeader>> = {}) {
    const props: React.ComponentProps<typeof AppHeader> = {
        app: app(),
        server: { name: "Production VPS" },
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

describe("AppHeader", () => {
    it("renders app name, server, status, and a deploy action when allowed", () => {
        const onDeploy = vi.fn();
        renderHeader({ onDeploy });

        expect(screen.getByRole("heading", { name: "Checkout API" })).toBeVisible();
        expect(screen.getByText((_, el) => el?.textContent === "Deployed on Production VPS")).toBeVisible();
        expect(screen.getByText("Stopped")).toBeVisible();

        const deployButton = screen.getByRole("button", { name: /Deploy/i });
        expect(deployButton).toBeEnabled();
        fireEvent.click(deployButton);
        expect(onDeploy).toHaveBeenCalledTimes(1);
    });

    it("disables dangerous actions while deleting", () => {
        renderHeader({ app: app({ status: "deleting" }) });

        expect(screen.getByRole("button", { name: /Deleting/i })).toBeDisabled();
        expect(screen.getByRole("button", { name: /Delete App/i })).toBeDisabled();
        expect(screen.getByText("Deleting app")).toBeVisible();
    });

    it("keeps the delete_failed retry surface available", () => {
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
        expect(screen.getByRole("button", { name: /Delete App/i })).toBeDisabled();
    });
});
