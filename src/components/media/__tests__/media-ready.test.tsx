// The finished Media page: usage, addresses, update, allowed websites, SDK snippet and removal.

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaState, MediaUsage } from "@/lib/api";

const searchParamsRef = vi.hoisted(() => ({ current: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
    useSearchParams: () => searchParamsRef.current,
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));

const apiMock = vi.hoisted(() => ({
    getMedia: vi.fn(),
    getMediaUsage: vi.fn(),
    startMediaCloudflareSignIn: vi.fn(),
    getMediaCloudflareAccounts: vi.fn(),
    getMediaCloudflareZones: vi.fn(),
    setupMedia: vi.fn(),
    removeMedia: vi.fn(),
}));
vi.mock("@/lib/api", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api")>();
    return { ...actual, api: apiMock };
});

import { ApiRequestError } from "@/lib/api";
import MediaPage from "@/app/(dashboard)/media/page";

function renderPage() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    return render(
        <QueryClientProvider client={client}>
            <MediaPage />
        </QueryClientProvider>,
    );
}

const STEPS = ["verify_access", "bucket", "upload_worker", "custom_domain", "zone_rules", "bucket_cors", "smoke_test"];

function ready(overrides: Partial<Extract<MediaState, { configured: true }>> = {}): MediaState {
    return {
        configured: true,
        cloudflareSignedIn: false,
        id: "p1",
        state: "READY",
        engine: "EDGE",
        cloudflareAccountId: "acct12345678",
        cloudflareAccountName: "Acme",
        publicHostname: "img.example.com",
        uploadUrl: "https://up.acme.workers.dev",
        workerUpdateAvailable: false,
        bucketName: "opslin-media-abc",
        allowedOrigins: ["https://shop.example.com"],
        transformsEnabled: false,
        lastVerifiedAt: "2026-10-06T10:00:00.000Z",
        createdAt: "2026-10-06T00:00:00.000Z",
        steps: STEPS.map((step) => ({ step, status: "DONE" as const, attempts: 1, detail: null, finishedAt: null })),
        ...overrides,
    };
}

const usage = (overrides: Record<string, unknown> = {}): MediaUsage =>
    ({
        available: true, limitsActive: true, version: "3", day: "2026-10-06", objects: 214, bytes: 12.4 * 1024 * 1024, uploaders: 3,
        caps: { projectObjects: 20000, projectBytes: 10 * 1024 ** 3, ipObjects: 2000, ipBytes: 2 * 1024 ** 3, ipPerMinute: 120 },
        history: [{ day: "2026-10-05", objects: 40, bytes: 2048 }], level: "ok", percent: 1, ...overrides,
    }) as MediaUsage;

beforeEach(() => {
    vi.clearAllMocks();
    // The settings tab holds these controls; the library is the default tab and has its own tests.
    searchParamsRef.current = new URLSearchParams("tab=settings");
    apiMock.getMedia.mockResolvedValue(ready());
    apiMock.getMediaUsage.mockResolvedValue(usage());
});

describe("ready: addresses, primary action, usage", () => {
    it("shows the image and upload addresses, one primary action, and today's numbers from the API", async () => {
        renderPage();
        expect(await screen.findByText("https://img.example.com")).toBeInTheDocument();
        expect(screen.getByText("https://up.acme.workers.dev")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Copy SDK snippet" })).toBeInTheDocument();
        expect(await screen.findByText("214 of 20,000")).toBeInTheDocument();
        expect(screen.getByText("12.4 MB of 10 GB")).toBeInTheDocument();
        expect(screen.queryByText(/Near today's upload limit|paused/)).not.toBeInTheDocument();
        expect(screen.queryByText("Update available")).not.toBeInTheDocument();
    });

    it("copies the setup code with this project's own addresses", async () => {
        const writeText = vi.fn(async () => undefined);
        Object.assign(navigator, { clipboard: { writeText } });
        renderPage();
        fireEvent.click(await screen.findByRole("button", { name: "Copy SDK snippet" }));
        await waitFor(() => expect(writeText).toHaveBeenCalled());
        const code = (writeText.mock.calls[0] as unknown as [string])[0];
        expect(code).toContain('uploadUrl: "https://up.acme.workers.dev"');
        expect(code).toContain('imageUrl: "https://img.example.com"');
    });

    it("warns neutrally near the limit and says uploads are paused at the limit (no red)", async () => {
        apiMock.getMediaUsage.mockResolvedValue(usage({ level: "warn", percent: 85, objects: 17000 }));
        const { unmount } = renderPage();
        const warn = await screen.findByText("Near today's upload limit. It resets at 00:00 UTC.");
        expect(warn.closest("p")?.className).not.toMatch(/danger|destructive/);
        unmount();

        apiMock.getMediaUsage.mockResolvedValue(usage({ level: "full", percent: 100, objects: 20000 }));
        renderPage();
        const full = await screen.findByText(/Uploads are paused until 00:00 UTC/);
        expect(full.closest("p")?.className).not.toMatch(/danger|destructive/);
    });

    it.each([
        [{ available: false, reason: "unauthorized" }, /Update the upload service to see usage/],
        [{ available: false, reason: "unreachable" }, /Couldn't reach your upload service/],
        [{ available: false, reason: "no_upload_service" }, /Usage appears once/],
        [usage({ limitsActive: false }), /Upload limits are off/],
    ])("explains an unreadable or old upload service: %#", async (answer, text) => {
        apiMock.getMediaUsage.mockResolvedValue(answer);
        renderPage();
        expect(await screen.findByText(text)).toBeInTheDocument();
        expect(screen.getAllByText("Not available").length).toBeGreaterThan(0);
    });

    it("keeps the page working when the usage call itself fails", async () => {
        apiMock.getMediaUsage.mockRejectedValue(new Error("boom"));
        renderPage();
        expect(await screen.findByText("Couldn't load usage. Try again in a moment.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Copy SDK snippet" })).toBeInTheDocument();
    });

    it("lists earlier days when there is history", async () => {
        renderPage();
        expect(await screen.findByText("2026-10-05")).toBeInTheDocument();
        expect(screen.getByText("40 uploads, 2 KB")).toBeInTheDocument();
    });
});

describe("update available", () => {
    beforeEach(() => apiMock.getMedia.mockResolvedValue(ready({ workerUpdateAvailable: true })));

    it("offers one update action that redeploys, then follows setup", async () => {
        apiMock.setupMedia.mockResolvedValue({ projectId: "p1", state: "PROVISIONING" });
        renderPage();
        expect(await screen.findByText("Update available")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Update upload service" }));
        await waitFor(() => expect(apiMock.setupMedia).toHaveBeenCalledWith({ cloudflareAccountId: "acct12345678", cloudflareAccountName: "Acme", refresh: true }));
    });

    it("asks to connect Cloudflare when the sign-in has ended", async () => {
        apiMock.setupMedia.mockRejectedValue(new ApiRequestError(409, { message: "x", code: "cloudflare_not_connected" } as never));
        renderPage();
        fireEvent.click(await screen.findByRole("button", { name: "Update upload service" }));
        expect(await screen.findByText("Connect Cloudflare to update the upload service.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Connect Cloudflare" })).toBeInTheDocument();
    });
});

describe("allowed websites", () => {
    it("adds a normalized website, removes one, and saves the whole list", async () => {
        apiMock.setupMedia.mockResolvedValue({ projectId: "p1", state: "PROVISIONING" });
        renderPage();
        const input = await screen.findByLabelText("Website address");
        fireEvent.change(input, { target: { value: "Blog.Example.com/post" } });
        fireEvent.click(screen.getByRole("button", { name: "Add website" }));
        expect(await screen.findByText("https://blog.example.com")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Remove https://shop.example.com", hidden: true }));
        expect(screen.queryByText("https://shop.example.com", { selector: "span" })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Save changes", hidden: true }));
        await waitFor(() =>
            expect(apiMock.setupMedia).toHaveBeenCalledWith({ cloudflareAccountId: "acct12345678", cloudflareAccountName: "Acme", allowedOrigins: ["https://blog.example.com"] }),
        );
    });

    it("says why a website is refused and keeps the list unchanged", async () => {
        renderPage();
        const input = await screen.findByLabelText("Website address");
        fireEvent.change(input, { target: { value: "http://shop.example.com" } });
        fireEvent.click(screen.getByRole("button", { name: "Add website" }));
        expect(await screen.findByText(/must start with https/)).toBeInTheDocument();
        fireEvent.change(input, { target: { value: "https://shop.example.com" } });
        fireEvent.click(screen.getByRole("button", { name: "Add website" }));
        expect(await screen.findByText("That website is already in the list.")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Save changes", hidden: true })).not.toBeInTheDocument();
    });

    it("asks to connect Cloudflare when saving needs a new sign-in", async () => {
        apiMock.setupMedia.mockRejectedValue(new ApiRequestError(409, { message: "x" } as never));
        renderPage();
        fireEvent.change(await screen.findByLabelText("Website address"), { target: { value: "blog.example.com" } });
        fireEvent.click(screen.getByRole("button", { name: "Add website" }));
        fireEvent.click(await screen.findByRole("button", { name: "Save changes", hidden: true }));
        expect(await screen.findByText("Connect Cloudflare to save this change.")).toBeInTheDocument();
    });
});

describe("use in your app", () => {
    it("shows the setup code with this project's addresses and is honest that the package isn't published", async () => {
        renderPage();
        expect(await screen.findByText(/uploadUrl: "https:\/\/up\.acme\.workers\.dev"/)).toBeInTheDocument();
        expect(screen.getByText(/imageUrl: "https:\/\/img\.example\.com"/)).toBeInTheDocument();
        expect(screen.getByText(/isn't on npm yet/)).toBeInTheDocument();
    });
});

describe("remove image hosting", () => {
    it("confirms first, then removes, and tells the person when storage was kept", async () => {
        apiMock.removeMedia.mockResolvedValue({ outcome: "removed", removed: ["Upload service"], kept: [{ what: "Storage", name: "opslin-media-abc", reason: "not_empty" }], failed: [] });
        renderPage();
        const summary = await screen.findByText("Remove image hosting", { selector: "summary" });
        const details = summary.closest("details") as HTMLElement;
        fireEvent.click(within(details).getByRole("button", { name: "Remove", hidden: true }));
        expect(await screen.findByText(/Storage is kept if it still holds images/)).toBeInTheDocument();
        expect(apiMock.removeMedia).not.toHaveBeenCalled();

        fireEvent.click(within(details).getByRole("button", { name: "Remove", hidden: true }));
        await waitFor(() => expect(apiMock.removeMedia).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("Image hosting removed"));
        expect(toastMock).toHaveBeenCalledWith(expect.stringContaining("opslin-media-abc"), expect.anything());
    });

    it("can be cancelled, and asks to connect Cloudflare when the sign-in has ended", async () => {
        apiMock.removeMedia.mockRejectedValue(new ApiRequestError(409, { message: "x", code: "cloudflare_not_connected" } as never));
        renderPage();
        const summary = await screen.findByText("Remove image hosting", { selector: "summary" });
        const details = summary.closest("details") as HTMLElement;
        fireEvent.click(within(details).getByRole("button", { name: "Remove", hidden: true }));
        fireEvent.click(within(details).getByRole("button", { name: "Cancel", hidden: true }));
        expect(within(details).queryByRole("button", { name: "Cancel", hidden: true })).not.toBeInTheDocument();

        fireEvent.click(within(details).getByRole("button", { name: "Remove", hidden: true }));
        fireEvent.click(within(details).getByRole("button", { name: "Remove", hidden: true }));
        expect(await screen.findByText("Connect Cloudflare to remove image hosting.")).toBeInTheDocument();
        expect(within(details).getByRole("button", { name: "Connect Cloudflare", hidden: true })).toBeInTheDocument();
    });

    it("lists what is left when the removal was only partly done", async () => {
        apiMock.removeMedia.mockResolvedValue({ outcome: "incomplete", removed: [], kept: [], failed: [{ what: "Image domain", message: "x" }] });
        renderPage();
        const summary = await screen.findByText("Remove image hosting", { selector: "summary" });
        const details = summary.closest("details") as HTMLElement;
        fireEvent.click(within(details).getByRole("button", { name: "Remove", hidden: true }));
        fireEvent.click(within(details).getByRole("button", { name: "Remove", hidden: true }));
        expect(await screen.findByText(/Not everything was removed: Image domain/)).toBeInTheDocument();
    });
});
