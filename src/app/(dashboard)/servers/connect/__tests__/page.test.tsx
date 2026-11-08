import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

describe("Connect server page, password and key install on", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubEnv("NEXT_PUBLIC_SSH_INSTALL", "true");
        vi.mocked(api.getServers).mockResolvedValue([]);
    });
    afterEach(() => vi.unstubAllEnvs());

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

    it("sends the tested server identity with the install, so a swapped server is refused", async () => {
        vi.mocked(api.testSshConnection).mockResolvedValue({ ok: true, hostKey: "SHA256:abc123" });
        vi.mocked(api.startSshInstall).mockResolvedValue({ jobId: "j1" });
        vi.mocked(api.getSshInstall).mockResolvedValue({ status: "RUNNING", percent: 20 });
        renderPage();
        await fillForm();
        fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
        fireEvent.click(await screen.findByRole("button", { name: "Install and connect" }));
        await waitFor(() => expect(api.startSshInstall).toHaveBeenCalledWith(expect.objectContaining({ hostKey: "SHA256:abc123" })));
    });

    it("falls back to the one-command method when the workspace is not opted in", async () => {
        vi.mocked(api.testSshConnection).mockRejectedValue(new ApiRequestError(403, { message: "off", code: "feature_disabled", details: { code: "feature_disabled" } } as never));
        renderPage();
        await fillForm();
        fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
        await waitFor(() => expect(screen.getByText(/isn't available on this workspace yet/i)).toBeInTheDocument());
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

describe("Connect server page, password and key install not available yet", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(api.getServers).mockResolvedValue([]);
    });

    it("leads with the one command and shows password / key as locked", () => {
        renderPage();
        expect(screen.getByTestId("method-command")).toBeInTheDocument();
        expect(screen.queryByTestId("method-ssh")).toBeNull();
        expect(screen.getByTestId("method-ssh-locked")).toHaveAttribute("aria-disabled", "true");
        expect(screen.getByText("Coming soon")).toBeInTheDocument();
    });

    it("lists the major providers, Oracle Cloud and Google Cloud included", () => {
        renderPage();
        const list = screen.getByRole("list", { name: "Supported providers" });
        for (const name of ["Hostinger", "AWS", "Oracle Cloud", "Google Cloud", "Azure", "DigitalOcean", "Hetzner"]) {
            expect(list).toHaveTextContent(name);
        }
    });

    it("gives a sudo command and a key-based login line for Oracle Cloud", () => {
        renderPage();
        fireEvent.click(screen.getByTestId("method-command"));
        expect(screen.getByTestId("install-command")).toHaveTextContent(/\| sh$/);
        fireEvent.click(screen.getByRole("combobox", { name: "Where is your server?" }));
        fireEvent.click(screen.getByRole("option", { name: /Oracle Cloud/ }));
        expect(screen.getAllByTestId("install-command")[0]).toHaveTextContent(/\| sudo sh$/);
        expect(screen.getByTestId("ssh-line")).toHaveTextContent("ssh -i path/to/your-key opc@YOUR_SERVER_IP");
        expect(screen.queryByText("Connect with a password instead")).toBeNull();
    });
});
