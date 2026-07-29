import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsSection } from "../SettingsSection";
import type { ComponentProps, ReactNode } from "react";
import type { App, Server } from "@/lib/api";

vi.mock("next/link", () => ({
    default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
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
    domain: "checkout.example.com",
    gitUrl: "https://github.com/acme/checkout.git",
    branch: "main",
    envVars: {},
    publicStatus: true,
    healthCheckMode: "strict_http",
    healthPath: "/ready",
    registryCredentials: {
        registry: "ghcr.io",
        username: "octocat",
        hasPassword: true,
    },
    createdAt: "2026-01-01T00:00:00.000Z",
};

const server: Pick<Server, "id" | "name"> = {
    id: "server-1",
    name: "Production VPS",
};

function renderSettings(overrides: Partial<ComponentProps<typeof SettingsSection>> = {}) {
    const props: ComponentProps<typeof SettingsSection> = {
        app,
        server,
        buildpackOverride: "",
        onBuildpackOverrideChange: vi.fn(),
        healthCheckMode: "strict_http",
        onHealthCheckModeChange: vi.fn(),
        healthPath: "/ready",
        onHealthPathChange: vi.fn(),
        registryHost: "ghcr.io",
        onRegistryHostChange: vi.fn(),
        registryUsername: "octocat",
        onRegistryUsernameChange: vi.fn(),
        registryPassword: "",
        onRegistryPasswordChange: vi.fn(),
        publicStatus: true,
        onPublicStatusChange: vi.fn(),
        deleteFailureReason: null,
        deleteLocked: false,
        deletePending: false,
        buildConfigPending: false,
        healthSettingsPending: false,
        publicStatusPending: false,
        registryTestPending: false,
        registryTestResult: null,
        registryTestError: null,
        buildConfigError: null,
        healthSettingsError: null,
        publicStatusError: null,
        onSaveBuildConfig: vi.fn(),
        onSaveHealthSettings: vi.fn(),
        onTestRegistry: vi.fn(),
        onSavePublicStatus: vi.fn(),
        onDelete: vi.fn(),
        onRetryDeleteCleanup: vi.fn(),
        ...overrides,
    };

    return {
        props,
        ...render(<SettingsSection {...props} />),
    };
}

describe("SettingsSection", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.assign(navigator, {
            clipboard: {
                writeText: vi.fn(),
            },
        });
    });

    it("renders app info, build config, public status, and danger zone without exposing registry secrets", () => {
        renderSettings({ registryPassword: "" });

        expect(screen.getByText("App Info")).toBeVisible();
        expect(screen.getByText("app-1")).toBeVisible();
        expect(screen.getByText("Health mode")).toBeVisible();
        expect(screen.getAllByText("Strict HTTP").length).toBeGreaterThan(0);
        expect(screen.getAllByText("Health path").length).toBeGreaterThan(0);
        expect(screen.getByText("/ready")).toBeVisible();
        expect(screen.getByText("Build Configuration")).toBeVisible();
        expect(screen.getByLabelText("Registry Host")).toHaveValue("ghcr.io");
        expect(screen.getByLabelText("Username")).toHaveValue("octocat");
        expect(screen.getByLabelText("Password / Token")).toHaveValue("");
        expect(screen.queryByDisplayValue("super-secret-token")).not.toBeInTheDocument();
        expect(screen.getByText("Public Status Page")).toBeVisible();
        expect(screen.getByText("Danger Zone")).toBeVisible();
    });

    it("shows frontend framework labels while submitting the node buildpack", () => {
        const onBuildpackOverrideChange = vi.fn();
        renderSettings({ onBuildpackOverrideChange });

        const select = screen.getByLabelText("Buildpack Override");
        expect(within(select).getByRole("option", { name: "Node.js / React / Vite / Next.js / Angular" })).toHaveAttribute("value", "node");
        expect(within(select).queryByRole("option", { name: "React / Vite" })).not.toBeInTheDocument();
        fireEvent.change(select, { target: { value: "node" } });
        expect(onBuildpackOverrideChange).toHaveBeenCalledWith("node");
        expect(screen.getByText("Frontend framework options use the Node.js buildpack with framework-specific output detection.")).toBeVisible();
        expect(screen.getByLabelText("Supported frontend frameworks")).toBeVisible();
    });

    it("renders and saves health check deployment settings", () => {
        const onHealthCheckModeChange = vi.fn();
        const onHealthPathChange = vi.fn();
        const onSaveHealthSettings = vi.fn();
        renderSettings({
            healthCheckMode: "auto",
            healthPath: "",
            onHealthCheckModeChange,
            onHealthPathChange,
            onSaveHealthSettings,
        });

        const modeSelect = screen.getByLabelText("Health check mode");
        expect(within(modeSelect).getByRole("option", { name: "Auto (recommended)" })).toHaveAttribute("value", "auto");
        expect(within(modeSelect).getByRole("option", { name: "Strict HTTP" })).toHaveAttribute("value", "strict_http");
        expect(within(modeSelect).getByRole("option", { name: "Port readiness" })).toHaveAttribute("value", "port");
        expect(screen.getByPlaceholderText("/health")).toBeVisible();
        expect(screen.getByText(/This is a Opslin deployment setting, not an environment variable./i)).toBeVisible();
        const legacyHealthVarPattern = new RegExp([
            ["HEALTHCHECK", "PATH"].join("_"),
            ["OPSLIN", "HEALTHCHECK", "PATH"].join("_"),
        ].join("|"));
        expect(screen.queryByText(legacyHealthVarPattern)).not.toBeInTheDocument();

        fireEvent.change(modeSelect, { target: { value: "port" } });
        fireEvent.change(screen.getByTestId("settings-health-check-path"), { target: { value: "/live" } });
        fireEvent.click(screen.getByRole("button", { name: /Save Health Settings/i }));

        expect(onHealthCheckModeChange).toHaveBeenCalledWith("port");
        expect(onHealthPathChange).toHaveBeenCalledWith("/live");
        expect(onSaveHealthSettings).toHaveBeenCalledTimes(1);
    });

    it("preserves build config, registry test, and public status actions", () => {
        const onSaveBuildConfig = vi.fn();
        const onTestRegistry = vi.fn();
        const onSavePublicStatus = vi.fn();
        renderSettings({ onSaveBuildConfig, onTestRegistry, onSavePublicStatus });

        fireEvent.click(screen.getByRole("button", { name: /Test Connection/i }));
        fireEvent.click(screen.getByRole("button", { name: /Save Build Config/i }));
        fireEvent.click(screen.getByRole("button", { name: /Save Status Setting/i }));

        expect(onTestRegistry).toHaveBeenCalledTimes(1);
        expect(onSaveBuildConfig).toHaveBeenCalledTimes(1);
        expect(onSavePublicStatus).toHaveBeenCalledTimes(1);
    });

    it("keeps typed delete confirmation working", () => {
        const onDelete = vi.fn();
        renderSettings({ onDelete });

        fireEvent.click(screen.getByRole("button", { name: "Delete App" }));
        expect(screen.getByText("Delete app?")).toBeVisible();

        const confirmButton = screen.getAllByRole("button", { name: "Delete App" }).at(-1);
        expect(confirmButton).toBeDisabled();

        fireEvent.change(screen.getByLabelText(/Type the app name to confirm/i), {
            target: { value: "Checkout API" },
        });
        expect(confirmButton).toBeEnabled();

        fireEvent.click(confirmButton!);
        expect(onDelete).toHaveBeenCalledTimes(1);
    });

    it("disables settings mutations while deleting", () => {
        renderSettings({
            app: { ...app, status: "deleting" },
            deleteLocked: true,
        });

        expect(screen.getByRole("button", { name: /Test Connection/i })).toBeDisabled();
        expect(screen.getByRole("button", { name: /Save Build Config/i })).toBeDisabled();
        expect(screen.getByRole("button", { name: /Save Status Setting/i })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Delete App" })).toBeDisabled();
        expect(screen.getByText("Deleting app")).toBeVisible();
    });

    it("shows delete_failed retry cleanup", () => {
        const onRetryDeleteCleanup = vi.fn();
        renderSettings({
            app: { ...app, status: "delete_failed", deployLogs: "cleanup failed" },
            deleteLocked: true,
            deleteFailureReason: "cleanup failed",
            onRetryDeleteCleanup,
        });

        expect(screen.getByText("Delete cleanup failed")).toBeVisible();
        expect(screen.getByText("cleanup failed")).toBeVisible();

        fireEvent.click(screen.getAllByRole("button", { name: /Retry cleanup/i })[0]);
        expect(onRetryDeleteCleanup).toHaveBeenCalledTimes(1);
    });
});
