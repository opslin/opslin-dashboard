import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ConnectServerPage from "../page";
import { ApiRequestError, api } from "@/lib/api";

vi.mock("@/lib/api", async () => {
    const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
    return {
        ...actual,
        api: {
            ...actual.api,
            getServers: vi.fn(),
            testSshConnection: vi.fn(),
            startSshInstall: vi.fn(),
            getSshInstall: vi.fn(),
            createSshKey: vi.fn(),
        },
    };
});

function renderPage() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <ConnectServerPage />
        </QueryClientProvider>
    );
}

async function fillForm() {
    fireEvent.click(screen.getByTestId("method-ssh"));
    fireEvent.change(screen.getByLabelText("Server IP address"), { target: { value: "203.0.113.10" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret" } });
}

describe("Connect server page", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(api.getServers).mockResolvedValue([]);
    });

    it("offers the three ways to connect", () => {
        renderPage();
        expect(screen.getByTestId("method-ssh")).toBeInTheDocument();
        expect(screen.getByTestId("method-command")).toBeInTheDocument();
        expect(screen.getByTestId("method-guide")).toBeInTheDocument();
    });

    it("keeps Install hidden until the connection test passes", async () => {
        vi.mocked(api.testSshConnection).mockResolvedValue({ ok: true, os: "Ubuntu 24.04", cpuCores: 2, memoryMb: 4096 });
        renderPage();
        await fillForm();
        expect(screen.queryByRole("button", { name: "Install and connect" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
        expect(await screen.findByText("Connected to 203.0.113.10 as root")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Install and connect" })).toBeInTheDocument();
        expect(api.testSshConnection).toHaveBeenCalledWith({ host: "203.0.113.10", port: 22, username: "root", auth: { type: "password", password: "secret" } });
    });

    it("walks through install to the connected screen", async () => {
        vi.mocked(api.testSshConnection).mockResolvedValue({ ok: true });
        vi.mocked(api.startSshInstall).mockResolvedValue({ jobId: "j1" });
        vi.mocked(api.getSshInstall).mockResolvedValue({ status: "COMPLETED", percent: 100 });
        renderPage();
        await fillForm();
        fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
        fireEvent.click(await screen.findByRole("button", { name: "Install and connect" }));
        expect(await screen.findByText("203.0.113.10 is connected")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Deploy your first app" })).toHaveAttribute("href", "/apps/new");
    });

    it("falls back to the one-command method when the SSH endpoints don't exist yet", async () => {
        vi.mocked(api.testSshConnection).mockRejectedValue(new ApiRequestError(404, { message: "Not found" } as never));
        renderPage();
        await fillForm();
        fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
        await waitFor(() => expect(screen.getByText(/isn't available on this workspace yet/i)).toBeInTheDocument());
        fireEvent.click(screen.getAllByRole("button", { name: /one-command method/i })[0]);
        expect(await screen.findByText("Waiting for your server to connect…")).toBeInTheDocument();
        expect(screen.getByTestId("install-command")).toHaveTextContent("curl -fsSL");
    });
});
