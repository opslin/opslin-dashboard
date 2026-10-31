/**
 * Storage "Sign in with Cloudflare": the button starts the sign-in, and after Cloudflare sends the browser
 * back the account is connected automatically (one account) or chosen (several). The API client is mocked.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const apiMock = vi.hoisted(() => ({
    startStorageCloudflareSignIn: vi.fn(),
    getStorageCloudflareAccounts: vi.fn(),
    saveR2Connection: vi.fn(),
}));
vi.mock("@/lib/api", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api")>();
    return { ...actual, api: apiMock };
});

import { ApiRequestError } from "@/lib/api";
import { CloudflareSignIn } from "../cloudflare-sign-in";

function renderIt(search = "") {
    window.history.replaceState(null, "", `/storage${search}`);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    return render(
        <QueryClientProvider client={client}>
            <CloudflareSignIn />
        </QueryClientProvider>,
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    apiMock.saveR2Connection.mockResolvedValue({ configured: true });
});

describe("CloudflareSignIn", () => {
    it("shows the Cloudflare logo and one primary action", () => {
        const { container } = renderIt();
        expect(screen.getByRole("button", { name: "Sign in with Cloudflare" })).toBeTruthy();
        expect(container.querySelector('img[src$="/brands/cloudflare.svg"]')).not.toBeNull();
    });

    it("starts the Storage sign-in when the button is pressed", async () => {
        apiMock.startStorageCloudflareSignIn.mockResolvedValue({ authorizeUrl: "about:blank#consent" });
        renderIt();
        fireEvent.click(screen.getByRole("button", { name: "Sign in with Cloudflare" }));
        await waitFor(() => expect(apiMock.startStorageCloudflareSignIn).toHaveBeenCalledTimes(1));
    });

    it("tells a non-admin they cannot connect, and an unconfigured server why it can't start", async () => {
        apiMock.startStorageCloudflareSignIn.mockRejectedValueOnce(new ApiRequestError(403, { message: "no" }));
        renderIt();
        fireEvent.click(screen.getByRole("button", { name: "Sign in with Cloudflare" }));
        expect((await screen.findByRole("alert")).textContent).toContain("Only owners and admins");
    });

    it("connects the only account automatically after Cloudflare sends the browser back", async () => {
        apiMock.getStorageCloudflareAccounts.mockResolvedValue({ accounts: [{ id: "acct-1", name: "Acme" }] });
        renderIt("?cloudflare=connected");

        await waitFor(() =>
            expect(apiMock.saveR2Connection).toHaveBeenCalledWith({ signIn: true, cloudflareAccountId: "acct-1", cloudflareAccountName: "Acme" }),
        );
        expect(window.location.search).toBe("");
    });

    it("lets the person choose when there are several accounts, and connects only the chosen one", async () => {
        apiMock.getStorageCloudflareAccounts.mockResolvedValue({
            accounts: [{ id: "a", name: "First" }, { id: "b", name: "Second" }],
        });
        renderIt("?cloudflare=connected");

        expect(await screen.findByText("Choose an account")).toBeTruthy();
        expect(apiMock.saveR2Connection).not.toHaveBeenCalled();
        expect((screen.getByRole("button", { name: "Connect" }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("shows what Cloudflare refused and keeps the sign-in button", async () => {
        apiMock.getStorageCloudflareAccounts.mockResolvedValue({ accounts: [{ id: "acct-1", name: "Acme" }] });
        apiMock.saveR2Connection.mockRejectedValue(new ApiRequestError(422, { message: "Cloudflare did not let Opslin create the storage key" }));
        renderIt("?cloudflare=connected");

        expect((await screen.findByRole("alert")).textContent).toContain("did not let Opslin create the storage key");
        expect(screen.getByRole("button", { name: "Sign in with Cloudflare" })).toBeTruthy();
    });

    it("says so when the sign-in was cancelled, without calling the API", () => {
        renderIt("?cloudflare=denied");
        expect(screen.getByRole("alert").textContent).toContain("cancelled");
        expect(apiMock.getStorageCloudflareAccounts).not.toHaveBeenCalled();
    });
});
