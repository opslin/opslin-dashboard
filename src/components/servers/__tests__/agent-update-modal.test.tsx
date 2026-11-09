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
