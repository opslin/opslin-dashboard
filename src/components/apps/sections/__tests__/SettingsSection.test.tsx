import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsSection } from "../SettingsSection";
import type { ComponentProps, ReactNode } from "react";
import { api, type App, type Server } from "@/lib/api";

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

// BuildpackVersionSelector (rendered inside the Build Configuration card) calls
// useQueryClient() and fires a real useQuery — this test file never wrapped render() in a
// QueryClientProvider, so every test here crashed with "No QueryClient set" before a single
// assertion ran (confirmed: 7/7 failing pre-existing, zero real coverage of this section).
vi.mock("@/lib/api", async () => {
    const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
    return {
        ...actual,
        api: {
            ...actual.api,
            listBuildpackVersions: vi.fn(),
        },
    };
});

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
        scaleTargetReplicaCount: 1,
        onScaleTargetReplicaCountChange: vi.fn(),
        scaleConfirmMultiInstance: false,
        onScaleConfirmMultiInstanceChange: vi.fn(),
        scalePending: false,
        scaleResult: null,
        scaleError: null,
        onScaleApp: vi.fn(),
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

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    return {
        props,
        ...render(
            <QueryClientProvider client={queryClient}>
                <SettingsSection {...props} />
            </QueryClientProvider>
        ),
    };
}

describe("SettingsSection", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(api.listBuildpackVersions).mockResolvedValue({ versions: [] });
        Object.assign(navigator, {
            clipboard: {
                writeText: vi.fn(),
            },
        });
    });

    it("renders the sections and keeps registry secrets out of the page", () => {
        renderSettings({ registryPassword: "" });

        expect(screen.getByRole("heading", { name: "General" })).toBeVisible();
        expect(screen.getByText("app-1")).toBeVisible();
        expect(screen.getByRole("heading", { name: "Build and run" })).toBeVisible();
        expect(screen.getByRole("heading", { name: "Health check" })).toBeVisible();
        expect(screen.getByRole("heading", { name: "Scaling" })).toBeVisible();
        expect(screen.getByRole("heading", { name: "Public status page" })).toBeVisible();
        expect(screen.getByRole("heading", { name: "Danger zone" })).toBeVisible();
        expect(screen.queryByDisplayValue("super-secret-token")).not.toBeInTheDocument();
    });

    it("keeps Dockerfile, Nginx and registry fields under Advanced until opened", () => {
        renderSettings({ registryPassword: "" });

        expect(screen.queryByLabelText("Registry host")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /Advanced/i }));
        expect(screen.getByLabelText("Registry host")).toHaveValue("ghcr.io");
        expect(screen.getByLabelText("Username")).toHaveValue("octocat");
        expect(screen.getByLabelText("Password / token")).toHaveValue("");
        expect(screen.getByRole("link", { name: /Edit Dockerfile override/i })).toHaveAttribute("href", "/apps/app-1/dockerfile");
        expect(screen.getByRole("link", { name: /Edit Nginx engine/i })).toHaveAttribute("href", "/apps/app-1/nginx");
    });

    it("saves health check settings and shows the plain-language hint", () => {
        const onHealthPathChange = vi.fn();
        const onSaveHealthSettings = vi.fn();
        renderSettings({ healthCheckMode: "auto", healthPath: "", onHealthPathChange, onSaveHealthSettings });

        expect(screen.getByText(/Opslin visits this address to see if your app is OK/i)).toBeVisible();
        fireEvent.change(screen.getByTestId("settings-health-check-path"), { target: { value: "/live" } });
        expect(onHealthPathChange).toHaveBeenCalledWith("/live");

        const section = screen.getByRole("heading", { name: "Health check" }).closest("div[id='settings-health']") as HTMLElement;
        fireEvent.click(within(section).getByRole("button", { name: /Save/i }));
        expect(onSaveHealthSettings).toHaveBeenCalledTimes(1);
    });

    it("disables the health check path input under process mode", () => {
        renderSettings({ healthCheckMode: "process", healthPath: "" });

        expect(screen.getByTestId("settings-health-check-path")).toBeDisabled();
        expect(screen.getByText(/Background workers have no web address/i)).toBeVisible();
    });

    it("applies scaling at a single instance without the confirmation checkbox", () => {
        const onScaleApp = vi.fn();
        renderSettings({ scaleTargetReplicaCount: 1, scaleConfirmMultiInstance: false, onScaleApp });

        expect(screen.queryByLabelText(/I confirm this app is safe to run as several copies/i)).not.toBeInTheDocument();
        const applyButton = screen.getByRole("button", { name: /Apply scaling/i });
        expect(applyButton).not.toBeDisabled();
        fireEvent.click(applyButton);
        expect(onScaleApp).toHaveBeenCalledTimes(1);
    });

    it("requires the confirmation checkbox before scaling above 1 instance", () => {
        const onScaleTargetReplicaCountChange = vi.fn();
        const onScaleConfirmMultiInstanceChange = vi.fn();
        renderSettings({ scaleTargetReplicaCount: 3, scaleConfirmMultiInstance: false, onScaleTargetReplicaCountChange, onScaleConfirmMultiInstanceChange });

        const confirmCheckbox = screen.getByLabelText(/I confirm this app is safe to run as several copies/i);
        expect(confirmCheckbox).not.toBeChecked();
        expect(screen.getByRole("button", { name: /Apply scaling/i })).toBeDisabled();
        fireEvent.click(confirmCheckbox);
        expect(onScaleConfirmMultiInstanceChange).toHaveBeenCalledWith(true);
        fireEvent.change(screen.getByLabelText("Number of instances"), { target: { value: "5" } });
        expect(onScaleTargetReplicaCountChange).toHaveBeenCalledWith(5);
    });

    it("shows the scaling result and error banners", () => {
        renderSettings({
            scaleTargetReplicaCount: 3,
            scaleConfirmMultiInstance: true,
            scaleResult: { replicaCount: 3, backends: [{ host: "127.0.0.1", port: 4000 }, { host: "127.0.0.1", port: 20001 }, { host: "127.0.0.1", port: 20002 }] },
            scaleError: new Error("Scaling to more than one instance requires confirmMultiInstance: true"),
        });

        expect(screen.getByRole("button", { name: /Apply scaling/i })).not.toBeDisabled();
        expect(screen.getByText(/Now running 3 instances on ports 4000, 20001, 20002/i)).toBeVisible();
        expect(screen.getByText(/requires confirmMultiInstance: true/i)).toBeVisible();
    });

    it("disables scaling controls while delete cleanup is locked", () => {
        renderSettings({ deleteLocked: true, scaleTargetReplicaCount: 1 });

        expect(screen.getByLabelText("Number of instances")).toBeDisabled();
        expect(screen.getByRole("button", { name: /Apply scaling/i })).toBeDisabled();
    });

    it("preserves build and public status save actions", () => {
        const onSaveBuildConfig = vi.fn();
        const onSavePublicStatus = vi.fn();
        const onTestRegistry = vi.fn();
        renderSettings({ onSaveBuildConfig, onSavePublicStatus, onTestRegistry });

        const build = document.getElementById("settings-build") as HTMLElement;
        fireEvent.click(within(build).getByRole("button", { name: /^Save$/i }));
        fireEvent.click(within(build).getByRole("button", { name: /Advanced/i }));
        fireEvent.click(within(build).getByRole("button", { name: /Test connection/i }));
        const status = document.getElementById("settings-status-page") as HTMLElement;
        fireEvent.click(within(status).getByRole("button", { name: /^Save$/i }));

        expect(onSaveBuildConfig).toHaveBeenCalledTimes(1);
        expect(onTestRegistry).toHaveBeenCalledTimes(1);
        expect(onSavePublicStatus).toHaveBeenCalledTimes(1);
    });

    it("keeps typed delete confirmation working", () => {
        const onDelete = vi.fn();
        renderSettings({ onDelete });

        fireEvent.click(screen.getByRole("button", { name: "Delete App" }));
        expect(screen.getByText("Delete app?")).toBeVisible();

        const confirmButton = screen.getAllByRole("button", { name: "Delete App" }).at(-1);
        expect(confirmButton).toBeDisabled();
        fireEvent.change(screen.getByLabelText(/Type the app name to confirm/i), { target: { value: "Checkout API" } });
        expect(confirmButton).toBeEnabled();
        fireEvent.click(confirmButton!);
        expect(onDelete).toHaveBeenCalledTimes(1);
    });

    it("disables settings mutations while deleting", () => {
        renderSettings({ app: { ...app, status: "deleting" }, deleteLocked: true });

        const build = document.getElementById("settings-build") as HTMLElement;
        expect(within(build).getByRole("button", { name: /^Save$/i })).toBeDisabled();
        const status = document.getElementById("settings-status-page") as HTMLElement;
        expect(within(status).getByRole("button", { name: /^Save$/i })).toBeDisabled();
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
