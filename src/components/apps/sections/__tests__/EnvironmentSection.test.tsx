import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EnvironmentSection } from "../EnvironmentSection";
import { envRecordToMaskedList } from "../env-helpers";
import { api } from "@/lib/api";
import type { ComponentProps } from "react";

// QuickDatabaseConnectDialog (rendered inside EnvironmentSection, even while closed — Dialog
// content is conditionally *visible*, not conditionally *mounted*) calls useQueryClient() and
// a real useQuery — this test file never wrapped render() in a QueryClientProvider, so every
// test here crashed with "No QueryClient set" before a single assertion ran (confirmed: 4/4
// failing pre-existing, zero real coverage of this section). Stubbed via vi.spyOn on the real
// `api` singleton rather than vi.mock("@/lib/api", ...) — `api` is a class instance, and
// `{...actual.api}`-style spreads silently drop every prototype method that isn't explicitly
// re-listed, which broke `usePlan()`'s unrelated `api.getCurrentPlan()` call (also used inside
// this same dialog) the first time this was tried.
function stubApiForDialog() {
    vi.spyOn(api, "getDatabases").mockResolvedValue([]);
}

function renderEnvironment(overrides: Partial<ComponentProps<typeof EnvironmentSection>> = {}) {
    const props: ComponentProps<typeof EnvironmentSection> = {
        appStatus: "running",
        serverId: "srv_test",
        envVars: envRecordToMaskedList({
            API_TOKEN: "super-secret-token",
            PUBLIC_URL: "https://example.com",
        }),
        envVarsChanged: false,
        deleteLocked: false,
        savePending: false,
        saveAndRedeployPending: false,
        deployPending: false,
        onChange: vi.fn(),
        onSave: vi.fn(),
        onSaveAndRedeploy: vi.fn(),
        ...overrides,
    };

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    return {
        props,
        ...render(
            <QueryClientProvider client={queryClient}>
                <EnvironmentSection {...props} />
            </QueryClientProvider>
        ),
    };
}

describe("EnvironmentSection", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        stubApiForDialog();
    });

    it("renders the variables table and masks secret-like values", () => {
        renderEnvironment();

        expect(screen.getByRole("heading", { name: "Environment variables" })).toBeVisible();
        expect(screen.getByText("API_TOKEN")).toBeVisible();
        expect(screen.getByText("PUBLIC_URL")).toBeVisible();
        // Secret-like values never reach the DOM until revealed.
        expect(screen.queryByText("super-secret-token")).not.toBeInTheDocument();
        expect(screen.getByText("https://example.com")).toBeVisible();
        fireEvent.click(screen.getByRole("button", { name: "Show API_TOKEN" }));
        expect(screen.getByRole("button", { name: "Hide API_TOKEN" })).toBeVisible();
    });

    it("adds a variable from the inline form", () => {
        const onChange = vi.fn();
        renderEnvironment({ onChange });

        fireEvent.click(screen.getByRole("button", { name: "Add variable" }));
        fireEvent.change(screen.getByLabelText("New variable name"), { target: { value: "stripe key" } });
        fireEvent.change(screen.getByLabelText("New variable value"), { target: { value: "sk_live_1" } });
        fireEvent.click(screen.getByRole("button", { name: /^Add$/ }));

        expect(onChange).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ key: "STRIPE_KEY", value: "sk_live_1" })]));
    });

    it("shows the unapplied-changes bar and calls save from the page boundary", () => {
        const onSave = vi.fn();
        const onDiscard = vi.fn();
        renderEnvironment({ envVarsChanged: true, changeCount: 2, onSave, onDiscard });

        expect(screen.getByText("2 changes not applied yet")).toBeVisible();
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(onSave).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole("button", { name: "Discard" }));
        expect(onDiscard).toHaveBeenCalledTimes(1);
    });

    it("hides the changes bar until something changed", () => {
        renderEnvironment({ envVarsChanged: false });

        expect(screen.queryByText(/not applied yet/i)).not.toBeInTheDocument();
    });

    it("calls save and redeploy after confirmation when running", () => {
        const onSaveAndRedeploy = vi.fn();
        const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
        renderEnvironment({ envVarsChanged: true, onSaveAndRedeploy });

        fireEvent.click(screen.getByRole("button", { name: /Save and redeploy/i }));

        expect(confirmSpy).toHaveBeenCalledWith("Save environment changes and redeploy this app?");
        expect(onSaveAndRedeploy).toHaveBeenCalledTimes(1);
    });

    it("disables env mutations while deleting", () => {
        renderEnvironment({ deleteLocked: true, envVarsChanged: true });

        expect(screen.getByText("Changes are paused while the app is being deleted.")).toBeVisible();
        expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
        expect(screen.getByRole("button", { name: /Save and redeploy/i })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Add variable" })).toBeDisabled();
        expect(screen.queryByText("super-secret-token")).not.toBeInTheDocument();
    });
});
