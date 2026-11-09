import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ConnectServerPage from "../page";

let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({ useSearchParams: () => searchParams, useRouter: () => ({ push: vi.fn() }) }));
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
            inspectSshKey: vi.fn(),
            startSshCleanup: vi.fn(),
            getAwsPolicy: vi.fn(),
            testAws: vi.fn(),
            installAws: vi.fn(),
            getCloudInstall: vi.fn(),
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
        searchParams = new URLSearchParams();
        vi.stubEnv("NEXT_PUBLIC_SSH_INSTALL", "true");
        vi.mocked(api.inspectSshKey).mockResolvedValue({ ok: true, format: "pem", encrypted: false, type: "ssh-rsa", message: null });
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
        searchParams = new URLSearchParams();
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

describe("Connect server page, key files, sudo, checks, reconnect and AWS", () => {
    const pickKey = async (text = "-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----") => {
        fireEvent.click(screen.getByTestId("method-ssh"));
        fireEvent.change(screen.getByLabelText("Server IP address"), { target: { value: "203.0.113.10" } });
        fireEvent.click(screen.getByRole("radio", { name: "SSH key" }));
        const file = new File([text], "opserver.pem", { type: "" });
        Object.defineProperty(file, "text", { value: async () => text });
        fireEvent.change(screen.getByLabelText("Key file"), { target: { files: [file] } });
        await screen.findByText("opserver.pem");
    };
    beforeEach(() => {
        vi.clearAllMocks();
        searchParams = new URLSearchParams();
        vi.stubEnv("NEXT_PUBLIC_SSH_INSTALL", "true");
        vi.mocked(api.getServers).mockResolvedValue([]);
        vi.mocked(api.inspectSshKey).mockResolvedValue({ ok: true, format: "pem", encrypted: false, type: "ssh-rsa", message: null });
    });
    afterEach(() => vi.unstubAllEnvs());

    it("fills the key box from a chosen file and says what kind of key it is", async () => {
        renderPage();
        await pickKey();
        expect((screen.getByLabelText("Private key") as HTMLTextAreaElement).value).toContain("BEGIN RSA PRIVATE KEY");
        expect(await screen.findByText(/PEM key, rsa/)).toBeInTheDocument();
    });

    it("asks for the passphrase when the file is locked, and explains a PuTTY version 3 file", async () => {
        vi.mocked(api.inspectSshKey).mockResolvedValue({ ok: false, format: "openssh", encrypted: true, type: null, message: "This key is locked with a passphrase. Enter it to continue." });
        renderPage();
        await pickKey();
        expect(await screen.findByLabelText("Key passphrase")).toBeInTheDocument();
        expect(await screen.findByText(/locked with a passphrase/)).toBeInTheDocument();
        vi.mocked(api.inspectSshKey).mockResolvedValue({ ok: false, format: "ppk3", encrypted: false, type: null, message: "This is a PuTTY .ppk file in the newer version 3 format. Export OpenSSH key in PuTTYgen." });
        fireEvent.change(screen.getByLabelText("Private key"), { target: { value: "PuTTY-User-Key-File-3: ssh-ed25519" } });
        expect(await screen.findByText(/Export OpenSSH key/)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Test connection" })).toBeDisabled();
    });

    it("refuses a file that is far too large to be a key", async () => {
        renderPage();
        fireEvent.click(screen.getByTestId("method-ssh"));
        fireEvent.click(screen.getByRole("radio", { name: "SSH key" }));
        const big = new File(["x".repeat(30_000)], "huge.bin");
        fireEvent.change(screen.getByLabelText("Key file"), { target: { files: [big] } });
        expect(await screen.findByText(/too large to be a key/)).toBeInTheDocument();
        expect((screen.getByLabelText("Private key") as HTMLTextAreaElement).value).toBe("");
    });

    it("shows a sudo password field when the server needs one, and sends it with the next test", async () => {
        vi.mocked(api.testSshConnection)
            .mockResolvedValueOnce({ ok: false, needsSudoPassword: true, message: "ubuntu needs a password to use sudo.", checks: [{ id: "access", status: "warn", title: "Administrator access", detail: "ubuntu needs a password to use sudo." }] })
            .mockResolvedValueOnce({ ok: true, hostKey: "SHA256:k", checks: [{ id: "system", status: "ok", title: "Ubuntu", detail: "x86_64" }] });
        renderPage();
        await pickKey();
        fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
        const sudo = await screen.findByLabelText("Password for sudo");
        fireEvent.change(sudo, { target: { value: "sudo-secret" } });
        fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
        await waitFor(() => expect(api.testSshConnection).toHaveBeenLastCalledWith(expect.objectContaining({ sudoPassword: "sudo-secret" })));
        expect(await screen.findByText("Connected to 203.0.113.10 as root")).toBeInTheDocument();
    });

    it("lists the pre-flight checks with what stops the install", async () => {
        vi.mocked(api.testSshConnection).mockResolvedValue({ ok: false, message: "Only 0.8 GB free.", checks: [{ id: "system", status: "ok", title: "Ubuntu 24.04", detail: "x86_64" }, { id: "docker", status: "warn", title: "Docker", detail: "3 containers run." }, { id: "disk", status: "fail", title: "Disk space", detail: "Only 0.8 GB free." }] });
        renderPage();
        await pickKey();
        fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
        const list = await screen.findByRole("list", { name: "Server checks" });
        expect(list).toHaveTextContent("Ubuntu 24.04");
        expect(list).toHaveTextContent("stops the install");
        expect(screen.queryByRole("button", { name: "Install and connect" })).toBeNull();
    });

    it("offers to remove an agent that is already there, after a confirmation", async () => {
        vi.mocked(api.testSshConnection).mockResolvedValue({ ok: false, agentPresent: true, hostKey: "SHA256:k", message: "An Opslin agent is already installed on this server.", checks: [] });
        vi.mocked(api.startSshCleanup).mockResolvedValue({ jobId: "c1" });
        vi.mocked(api.getSshInstall).mockResolvedValue({ kind: "cleanup", status: "COMPLETED", percent: 100 });
        renderPage();
        await pickKey();
        fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
        fireEvent.click(await screen.findByRole("button", { name: "Remove the Opslin agent from this server" }));
        expect(await screen.findByText(/Your Docker containers and data stay/)).toBeInTheDocument();
        expect(api.startSshCleanup).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Remove the agent" }));
        expect(await screen.findByText("The Opslin agent was removed")).toBeInTheDocument();
        expect(api.startSshCleanup).toHaveBeenCalledWith(expect.objectContaining({ confirm: true, hostKey: "SHA256:k" }));
    });

    it("reconnects an existing server: repair mode with its id, and a repair button", async () => {
        searchParams = new URLSearchParams({ repair: "srv-1", name: "Mumbai box" });
        vi.mocked(api.testSshConnection).mockResolvedValue({ ok: true, hostKey: "SHA256:k", checks: [] });
        vi.mocked(api.startSshInstall).mockResolvedValue({ jobId: "r1" });
        vi.mocked(api.getSshInstall).mockResolvedValue({ kind: "repair", status: "COMPLETED", percent: 100 });
        renderPage();
        expect(screen.getByRole("heading", { name: "Reconnect Mumbai box" })).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText("Server IP address"), { target: { value: "203.0.113.10" } });
        fireEvent.change(screen.getByLabelText("Password"), { target: { value: "pw" } });
        fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
        expect(api.testSshConnection).toHaveBeenCalledWith(expect.objectContaining({ mode: "repair", serverId: "srv-1" }));
        fireEvent.click(await screen.findByRole("button", { name: "Repair and reconnect" }));
        expect(await screen.findByText("Mumbai box is connected")).toBeInTheDocument();
    });

    it("picks the login name and key tab for AWS and Oracle", async () => {
        renderPage();
        fireEvent.click(screen.getByTestId("method-ssh"));
        fireEvent.click(screen.getByRole("combobox", { name: "Your provider" }));
        fireEvent.click(await screen.findByRole("option", { name: /Oracle Cloud/ }));
        expect((screen.getByLabelText("Username") as HTMLInputElement).value).toBe("opc");
        expect(screen.getByRole("radio", { name: "SSH key" })).toHaveAttribute("aria-checked", "true");
    });
});

describe("Connect with an AWS account", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        searchParams = new URLSearchParams();
        vi.stubEnv("NEXT_PUBLIC_SSH_INSTALL", "true");
        vi.stubEnv("NEXT_PUBLIC_CLOUD_INSTALL", "true");
        vi.mocked(api.getServers).mockResolvedValue([]);
    });
    afterEach(() => vi.unstubAllEnvs());
    const fill = () => {
        fireEvent.click(screen.getByTestId("method-aws"));
        fireEvent.change(screen.getByLabelText("Instance ID"), { target: { value: "i-0123456789abcdef0" } });
        fireEvent.change(screen.getByLabelText("Access key ID"), { target: { value: "AKIAIOSFODNN7EXAMPLE" } });
        fireEvent.change(screen.getByLabelText("Secret access key"), { target: { value: "x".repeat(40) } });
    };

    it("is hidden unless switched on", () => {
        vi.unstubAllEnvs();
        vi.stubEnv("NEXT_PUBLIC_SSH_INSTALL", "true");
        renderPage();
        expect(screen.queryByTestId("method-aws")).toBeNull();
    });

    it("shows the narrow policy, checks the instance, then installs and follows the cloud job", async () => {
        vi.mocked(api.getAwsPolicy).mockResolvedValue({ Version: "2012-10-17", Statement: [{ Action: ["ec2-instance-connect:SendSSHPublicKey"] }] });
        vi.mocked(api.testAws).mockResolvedValue({ ok: true, os: "Ubuntu 24.04", instance: { id: "i-0123456789abcdef0", name: "web", state: "running", publicIp: "13.203.161.226", availabilityZone: "ap-south-1a" } });
        vi.mocked(api.installAws).mockResolvedValue({ jobId: "a1" });
        vi.mocked(api.getCloudInstall).mockResolvedValue({ status: "COMPLETED", percent: 100 });
        renderPage();
        fill();
        fireEvent.click(screen.getByRole("button", { name: "Show the policy to give the IAM user" }));
        expect(await screen.findByTestId("aws-policy")).toHaveTextContent("SendSSHPublicKey");
        fireEvent.click(screen.getByRole("button", { name: "Check the instance" }));
        expect(await screen.findByText("web is ready")).toBeInTheDocument();
        expect(api.testAws).toHaveBeenCalledWith(expect.objectContaining({ instanceId: "i-0123456789abcdef0", method: "instance-connect", osUser: "ubuntu", region: "ap-south-1" }));
        fireEvent.click(screen.getByRole("button", { name: "Install and connect" }));
        await waitFor(() => expect(api.getCloudInstall).toHaveBeenCalledWith("a1"));
        expect(api.getSshInstall).not.toHaveBeenCalled();
        expect(await screen.findByText("i-0123456789abcdef0 is connected")).toBeInTheDocument();
    });

    it("switching to Session Manager drops the server username and changes the policy", async () => {
        renderPage();
        fill();
        expect(screen.getByLabelText("Server username")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("radio", { name: /Session Manager/ }));
        expect(screen.queryByLabelText("Server username")).toBeNull();
    });
});
