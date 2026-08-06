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

    it("renders the env editor and masks secret-like keys", () => {
        renderEnvironment();

        expect(screen.getAllByText("Environment Variables").length).toBeGreaterThan(0);
        expect(screen.getByText(/Frontend frameworks expose only public prefixes/i)).toBeVisible();
        expect(screen.getByDisplayValue("API_TOKEN")).toBeVisible();
        // Secret-like values render as a masked bullet span with a reveal toggle, not as a
        // plain input carrying a literal masked placeholder — the real value never touches the
        // DOM at all unless explicitly revealed.
        expect(screen.getAllByTitle("Show value").length).toBeGreaterThan(0);
        expect(screen.queryByDisplayValue("super-secret-token")).not.toBeInTheDocument();
        expect(screen.queryByText("super-secret-token")).not.toBeInTheDocument();
        expect(screen.getByDisplayValue("PUBLIC_URL")).toBeVisible();
        expect(screen.getByDisplayValue("https://example.com")).toBeVisible();
    });

    it("calls the save mutation from the page boundary", () => {
        const onSave = vi.fn();
        renderEnvironment({ envVarsChanged: true, onSave });

        fireEvent.click(screen.getByRole("button", { name: /Save Only/i }));

        expect(onSave).toHaveBeenCalledTimes(1);
    });

    it("calls save and redeploy after confirmation when running", () => {
        const onSaveAndRedeploy = vi.fn();
        const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
        renderEnvironment({ envVarsChanged: true, onSaveAndRedeploy });

        fireEvent.click(screen.getByRole("button", { name: /Save & Redeploy/i }));

        expect(confirmSpy).toHaveBeenCalledWith("Save environment changes and redeploy this app?");
        expect(onSaveAndRedeploy).toHaveBeenCalledTimes(1);
    });

    it("disables env mutations while deleting", () => {
        renderEnvironment({ deleteLocked: true, envVarsChanged: true });

        expect(screen.getByText("Environment changes are paused while cleanup is pending.")).toBeVisible();
        expect(screen.getByRole("button", { name: /Save Only/i })).toBeDisabled();
        expect(screen.getByRole("button", { name: /Save & Redeploy/i })).toBeDisabled();
        // Exact, case-sensitive match — there's also an icon-only "Add variable" (lowercase)
        // confirm button on the draft row whose accessible name would otherwise also match.
        expect(screen.getByRole("button", { name: "Add Variable" })).toBeDisabled();
        expect(screen.queryByDisplayValue("super-secret-token")).not.toBeInTheDocument();
    });
});
