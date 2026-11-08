import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { StorageOverview } from "@/components/storage/storage-overview";

const apiMock = vi.hoisted(() => ({
    saveR2Connection: vi.fn(() => Promise.resolve({ configured: true })),
    signOutCloudflare: vi.fn(() => Promise.resolve({ success: true, bucketsKept: 1 })),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

// Nothing else may reach the network: every query is answered from a seeded cache.
vi.mock("@/components/storage/cloudflare-sign-in", () => ({ CloudflareSignIn: () => <button>Sign in with Cloudflare</button> }));
vi.mock("@/components/storage/cloudflare-token-connect", () => ({ CloudflareTokenConnect: () => <div>token form</div> }));

function renderOverview(seed: Record<string, unknown>) {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false, refetchOnMount: false } } });
    client.setQueryData(["r2Connection"], seed.connection);
    client.setQueryData(["r2Buckets"], seed.buckets ?? { buckets: [] });
    client.setQueryData(["backupStorage"], seed.backups ?? { configured: false });
    client.setQueryData(["media"], seed.media ?? { locked: true });
    return render(
        <QueryClientProvider client={client}>
            <StorageOverview />
        </QueryClientProvider>
    );
}

beforeEach(() => apiMock.saveR2Connection.mockClear());

const connected = { configured: true, cloudflareAccountId: "a", cloudflareAccountName: "Acme account", lastVerifiedAt: new Date().toISOString() };

describe("Storage overview", () => {
    it("shows the Cloudflare account once and one tile per service, each linking to its tab", () => {
        renderOverview({
            connection: connected,
            buckets: { buckets: [{ id: "1", bucketName: "acme-files", s3Endpoint: "https://x.r2.cloudflarestorage.com" }] },
            backups: { configured: true, provider: "cloudflare_r2", bucket: "acme-backups", lastVerifiedAt: new Date().toISOString() },
        });
        expect(screen.getByText("Acme account")).toBeInTheDocument();
        expect(screen.getAllByText("Cloudflare")).toHaveLength(1);
        expect(screen.getByRole("link", { name: /Open buckets/ })).toHaveAttribute("href", "/storage/buckets");
        expect(screen.getByRole("link", { name: /Open backups/ })).toHaveAttribute("href", "/storage/backups");
        expect(screen.getByText("1 bucket")).toBeInTheDocument();
        expect(screen.getByText("acme-backups")).toBeInTheDocument();
    });

    it("hides the Media tile until the API says Media is on for the organization", () => {
        renderOverview({ connection: connected, media: { locked: true } });
        expect(screen.queryByText("Media")).not.toBeInTheDocument();
    });

    it("before sign-in: one sign-in button, the token option behind a disclosure, and the Cloudflare tiles locked", () => {
        renderOverview({ connection: { configured: false, cloudflareSignedIn: false }, media: { locked: false, media: { configured: false, cloudflareSignedIn: false } } });
        expect(screen.getAllByRole("button", { name: "Sign in with Cloudflare" })).toHaveLength(1);
        expect(screen.getByText("Use an API token instead")).toBeInTheDocument();
        const buckets = screen.getByLabelText("Buckets needs Cloudflare");
        expect(within(buckets).getByText("Needs Cloudflare", { selector: "span" })).toBeInTheDocument();
        // Backups also works with any S3 provider, so it stays open before the Cloudflare sign-in.
        expect(screen.getByRole("link", { name: /Choose a bucket/ })).toHaveAttribute("href", "/storage/backups");
    });

    it("offers the Cloudflare options menu once connected", () => {
        renderOverview({ connection: connected, buckets: { buckets: [{ id: "1", bucketName: "b", s3Endpoint: "https://x" }] } });
        expect(screen.getByRole("button", { name: "Cloudflare options" })).toBeInTheDocument();
    });

    it("signed in through Media already: uses that same Cloudflare account, no second sign-in", async () => {
        renderOverview({
            connection: { configured: false, cloudflareSignedIn: true },
            media: {
                locked: false,
                media: { configured: true, cloudflareSignedIn: true, cloudflareAccountId: "acct_media", cloudflareAccountName: "Media account", state: "READY", publicHostname: "img.example.com", steps: [], allowedOrigins: [] },
            },
        });
        await waitFor(() =>
            expect(apiMock.saveR2Connection).toHaveBeenCalledWith({ signIn: true, cloudflareAccountId: "acct_media", cloudflareAccountName: "Media account" })
        );
        expect(apiMock.saveR2Connection).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole("button", { name: "Sign in with Cloudflare" })).not.toBeInTheDocument();
    });

    it("not signed in anywhere: never tries to connect by itself", () => {
        renderOverview({ connection: { configured: false, cloudflareSignedIn: false }, media: { locked: false, media: { configured: false, cloudflareSignedIn: false } } });
        expect(apiMock.saveR2Connection).not.toHaveBeenCalled();
    });

    it("signed out (API sends no details): every Cloudflare tile is locked and shows no names, counts or images", () => {
        renderOverview({
            connection: { configured: true, needsReconnect: true },
            backups: { configured: true, provider: "cloudflare_r2", needsCloudflareSignIn: true },
            media: { locked: false, media: { configured: true, cloudflareSignedIn: false, state: "NEEDS_RECONNECT", cloudflareAccountId: "", cloudflareAccountName: null, publicHostname: null, bucketName: "", uploadUrl: null, allowedOrigins: [], steps: [] } },
        });
        expect(screen.getByLabelText("Buckets needs Cloudflare")).toBeInTheDocument();
        expect(screen.getByLabelText("Backups needs Cloudflare")).toBeInTheDocument();
        expect(screen.getByLabelText("Media needs Cloudflare")).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: /Open (buckets|backups|media)/ })).not.toBeInTheDocument();
        // Not even the state words of a locked service appear.
        expect(document.body.textContent).not.toMatch(/Connected|Setting up|Not set up|None yet|Saving database/);
        // Generic wording is fine; there is just no customer data (no counts, names or addresses).
        expect(document.body.textContent).not.toMatch(/\d+ (images?|buckets?)|img\.|\.workers\.dev/);
    });

    it("Sign out of Cloudflare works even while buckets exist, and signs out of all three at once", async () => {
        renderOverview({ connection: connected, buckets: { buckets: [{ id: "1", bucketName: "b", s3Endpoint: "https://x" }] } });
        const trigger = screen.getByRole("button", { name: "Cloudflare options" });
        fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
        fireEvent.click(await screen.findByRole("menuitem", { name: "Sign out of Cloudflare" }));
        expect(await screen.findByText(/Buckets, Backups and Media all lock/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
        await waitFor(() => expect(apiMock.signOutCloudflare).toHaveBeenCalledTimes(1));
    });
});
