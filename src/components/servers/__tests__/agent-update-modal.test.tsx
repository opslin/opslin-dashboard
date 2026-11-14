import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { api, ApiRequestError } from "@/lib/api";
import { AgentUpdateModal } from "../agent-update-modal";

function renderModal() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}><AgentUpdateModal serverId="s1" open onOpenChange={vi.fn()} /></QueryClientProvider>);
}

describe("AgentUpdateModal when no release is published", () => {
    it("shows a calm explanation with a way to check again, and no Update button", async () => {
        const spy = vi.spyOn(api, "getAgentUpdateInfo").mockRejectedValue(new ApiRequestError(503, { code: "agent_release_unavailable", message: "Agent release details are temporarily unavailable. Verify the release manifest and agent binaries are deployed." }));
        renderModal();
        expect(await screen.findByText("No agent update has been published yet")).toBeTruthy();
        expect(screen.queryByText(/manifest/)).toBeNull();
        expect(screen.queryByRole("button", { name: /Update now/ })).toBeNull();
        const calls = spy.mock.calls.length;
        fireEvent.click(screen.getByRole("button", { name: /Check again/ }));
        await waitFor(() => expect(spy.mock.calls.length).toBeGreaterThan(calls));
    });
});

it("does not keep tracking the previous completed update when reopened for a newer release", async () => {
    let latest = "2.0.45";
    vi.spyOn(api, "getAgentUpdateInfo").mockImplementation(async () => ({ currentVersion: "2.0.44", latestVersion: latest, updateAvailable: true, connected: true, canSelfUpdate: true, canQueueUpdate: true, activeUpdateJob: null, lastUpdateJob: null, release: { whyUpdate: [], bugFixes: [], newFunctions: [], vpsChanges: [], securityNotes: [] }, artifact: { sizeBytes: 100 } }) as never);
    vi.spyOn(api, "updateAgent").mockResolvedValue({ jobId: "old-job" } as never);
    vi.spyOn(api, "getServerJobStatus").mockResolvedValue({ id: "old-job", status: "COMPLETED", payload: { version: "2.0.45" } } as never);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = (open: boolean) => <QueryClientProvider client={client}><AgentUpdateModal serverId="s1" open={open} onOpenChange={vi.fn()} /></QueryClientProvider>;
    const rendered = render(view(true));
    fireEvent.click(await screen.findByRole("button", { name: /Update now/ }));
    await screen.findByText(/Waiting for the agent to reconnect/);
    rendered.rerender(view(false));
    latest = "2.0.46";
    await client.invalidateQueries({ queryKey: ["agent-update", "s1"] });
    rendered.rerender(view(true));
    expect(await screen.findByRole("button", { name: /Update now/ })).toBeTruthy();
});
