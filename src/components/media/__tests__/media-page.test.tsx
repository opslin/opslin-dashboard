/**
 * Opslin Media page — every designed state (docs/audit/27): loading, locked, not connected
 * (+ notices), connected/pick, provisioning with each step status, ready, needs reconnect.
 * The API client is mocked; no network. Also checks the helper logic and an axe pass.
 */

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import "vitest-axe/extend-expect";
import * as matchers from "vitest-axe/matchers";
import type { MediaState, MediaStepRecord } from "@/lib/api";
import { mediaRefetchInterval } from "@/hooks/use-media";
import { buildMediaSetupInput, mediaImageHostname } from "../media-setup";
import { MediaStepRail, describeStep } from "../media-step-rail";

expect.extend(matchers);

const searchParamsRef = vi.hoisted(() => ({ current: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
    useSearchParams: () => searchParamsRef.current,
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/layout/header", () => ({
    Header: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

const apiMock = vi.hoisted(() => ({
    getMedia: vi.fn(),
    startMediaCloudflareSignIn: vi.fn(),
    getMediaCloudflareAccounts: vi.fn(),
    getMediaCloudflareZones: vi.fn(),
    setupMedia: vi.fn(),
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

const step = (name: string, status: MediaStepRecord["status"], detail: unknown = null): MediaStepRecord => ({
    step: name, status, attempts: 1, detail, finishedAt: null,
});

const ALL_STEPS = ["verify_access", "bucket", "upload_worker", "custom_domain", "zone_rules", "bucket_cors", "smoke_test"];

function project(overrides: Partial<Extract<MediaState, { configured: true }>> = {}): MediaState {
    return {
        configured: true,
        cloudflareSignedIn: true,
        id: "p1",
        state: "PROVISIONING",
        engine: "EDGE",
        cloudflareAccountId: "acct12345678",
        cloudflareAccountName: "Acme",
        publicHostname: null,
        uploadUrl: null,
        workerUpdateAvailable: false,
        bucketName: "opslin-media-abc",
        allowedOrigins: [],
        transformsEnabled: false,
        lastVerifiedAt: null,
        createdAt: "2026-10-06T00:00:00.000Z",
        steps: ALL_STEPS.map((name) => step(name, "PENDING")),
        ...overrides,
    };
}

const forbidden = () => new ApiRequestError(403, { message: "This feature requires a higher plan" } as never);

beforeEach(() => {
    vi.clearAllMocks();
    searchParamsRef.current = new URLSearchParams();
});

describe("loading and locked", () => {
    it("shows a layout-matching skeleton, not 'Loading…' text, while the state loads", () => {
        apiMock.getMedia.mockReturnValue(new Promise(() => undefined));
        renderPage();
        expect(screen.getByLabelText("Loading Media")).toBeInTheDocument();
        expect(screen.queryByText(/^Loading/)).not.toBeInTheDocument();
    });

    it("shows a neutral locked state (not an error) when Media isn't enabled for the organization", async () => {
        apiMock.getMedia.mockRejectedValue(forbidden());
        renderPage();
        expect(await screen.findByText("Media isn't turned on for this organization")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Connect Cloudflare" })).not.toBeInTheDocument();
    });

    it("offers Retry when the state can't be loaded for another reason", async () => {
        apiMock.getMedia.mockRejectedValueOnce(new ApiRequestError(500, { message: "boom" } as never));
        apiMock.getMedia.mockResolvedValueOnce({ configured: false, cloudflareSignedIn: false });
        renderPage();

        expect(await screen.findByText("Couldn't load Media")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Retry" }));
        expect(await screen.findByText("Not connected")).toBeInTheDocument();
    });
});

describe("design rules (DESIGN.md)", () => {
    it("uses the real Cloudflare logo in every state that shows the service, never a generic icon", async () => {
        apiMock.getMedia.mockResolvedValue({ configured: false, cloudflareSignedIn: false });
        const { container, unmount } = renderPage();
        await screen.findByText("Not connected");
        expect(container.querySelector('img[src$="/brands/cloudflare.svg"]')).not.toBeNull();
        unmount();

        searchParamsRef.current = new URLSearchParams("tab=settings");
        apiMock.getMedia.mockResolvedValue(project({ state: "READY", publicHostname: "img.example.com", steps: ALL_STEPS.map((name) => step(name, "DONE")) }));
        const ready = renderPage();
        await screen.findByText("Ready");
        expect(ready.container.querySelector('img[src$="/brands/cloudflare.svg"]')).not.toBeNull();
    });

    it("is flat: no glass surface, no nested card, one container (V7, S1)", async () => {
        apiMock.getMedia.mockResolvedValue(project());
        const { container } = renderPage();
        await screen.findByRole("list", { name: "Setup progress" });
        expect(container.querySelector(".dashboard-surface")).toBeNull();
        expect(container.querySelectorAll('[data-slot="card"]')).toHaveLength(1);
        expect(container.querySelector('[data-slot="card"] [data-slot="card"]')).toBeNull();
    });

    it("has no middle-dot meta strings and no arrow-suffixed buttons (C7)", async () => {
        searchParamsRef.current = new URLSearchParams("tab=settings");
        apiMock.getMedia.mockResolvedValue(project({ state: "READY", publicHostname: "img.example.com", lastVerifiedAt: new Date().toISOString(), steps: ALL_STEPS.map((name) => step(name, "DONE")) }));
        const { container } = renderPage();
        await screen.findByText("Ready");
        expect(container.textContent).not.toContain("·");
        expect(container.textContent).not.toMatch(/→/);
    });

    it("title or description, never both: the page has one heading and no subtitle", async () => {
        apiMock.getMedia.mockResolvedValue({ configured: false, cloudflareSignedIn: false });
        renderPage();
        await screen.findByText("Not connected");
        expect(screen.getByRole("heading", { level: 1, name: "Media" })).toBeInTheDocument();
        expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    });
});

describe("not connected", () => {
    beforeEach(() => apiMock.getMedia.mockResolvedValue({ configured: false, cloudflareSignedIn: false }));

    it("previews the setup steps as 'Not started' so the layout never changes shape", async () => {
        renderPage();
        await screen.findByText("Not connected");
        expect(screen.getAllByText("Not started")).toHaveLength(7);
    });

    it("has one primary action, and starts Cloudflare sign-in by navigating to the consent URL", async () => {
        apiMock.startMediaCloudflareSignIn.mockResolvedValue({ authorizeUrl: "https://dash.cloudflare.com/oauth2/auth?x=1", expiresAt: "z" });
        const assign = vi.fn();
        Object.defineProperty(window, "location", { value: { ...window.location, assign }, writable: true });
        renderPage();

        fireEvent.click(await screen.findByRole("button", { name: "Connect Cloudflare" }));

        await waitFor(() => expect(assign).toHaveBeenCalledWith("https://dash.cloudflare.com/oauth2/auth?x=1"));
        expect(screen.getAllByRole("button")).toHaveLength(1);
    });

    it.each([
        [503, "Cloudflare sign-in isn't set up on this server yet."],
        [403, "Only owners and admins can connect Cloudflare."],
    ])("explains a %s from the start call in a neutral locked line", async (status, line) => {
        apiMock.startMediaCloudflareSignIn.mockRejectedValue(new ApiRequestError(status, { message: "x" } as never));
        renderPage();
        fireEvent.click(await screen.findByRole("button", { name: "Connect Cloudflare" }));
        expect(await screen.findByText(line)).toBeInTheDocument();
    });

    it.each([
        ["denied", "Cloudflare access wasn't granted."],
        ["error", "Couldn't finish connecting to Cloudflare. Try again."],
    ])("shows the %s notice from the return redirect", async (value, line) => {
        searchParamsRef.current = new URLSearchParams({ cloudflare: value });
        renderPage();
        expect(await screen.findByText(line)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Connect Cloudflare" })).toBeInTheDocument();
    });

    it("treats a 'blocked' return as the locked state", async () => {
        searchParamsRef.current = new URLSearchParams({ cloudflare: "blocked" });
        renderPage();
        expect(await screen.findByText("Media isn't turned on for this organization")).toBeInTheDocument();
    });
});

describe("connected, no project yet", () => {
    beforeEach(() => {
        apiMock.getMedia.mockResolvedValue({ configured: false, cloudflareSignedIn: true });
        apiMock.getMediaCloudflareAccounts.mockResolvedValue({ accounts: [{ id: "acct12345678", name: "Acme" }] });
        apiMock.getMediaCloudflareZones.mockResolvedValue({ zones: [{ id: "zone12345678", name: "example.com", status: "active" }] });
    });

    it("picks the only account for the customer and sets up with it (no domain yet)", async () => {
        apiMock.setupMedia.mockResolvedValue({ projectId: "p1", state: "PROVISIONING" });
        renderPage();

        expect(await screen.findByText("Connected")).toBeInTheDocument();
        const setup = screen.getByRole("button", { name: "Set up image hosting" });
        await waitFor(() => expect(setup).toBeEnabled());
        fireEvent.click(setup);

        await waitFor(() => expect(apiMock.setupMedia).toHaveBeenCalledWith({ cloudflareAccountId: "acct12345678", cloudflareAccountName: "Acme" }));
        expect(apiMock.getMediaCloudflareZones).toHaveBeenCalledWith("acct12345678");
    });

    it("states what will be created and that nothing is stored on Opslin", async () => {
        renderPage();
        expect(await screen.findByText(/Creates a storage bucket and an upload service in your Cloudflare account/)).toBeInTheDocument();
        expect(screen.getByText(/Nothing is stored on Opslin/)).toBeInTheDocument();
    });

    it("shows a neutral 'not available yet' line when the API answers 501", async () => {
        apiMock.setupMedia.mockRejectedValue(new ApiRequestError(501, { message: "Media setup is not available yet" } as never));
        renderPage();
        const setup = await screen.findByRole("button", { name: "Set up image hosting" });
        await waitFor(() => expect(setup).toBeEnabled());
        fireEvent.click(setup);
        expect(await screen.findByText("Setup isn't available yet.")).toBeInTheDocument();
    });

    it("asks to connect again when the sign-in has expired (409)", async () => {
        apiMock.setupMedia.mockRejectedValue(new ApiRequestError(409, { message: "x", code: "cloudflare_not_connected" } as never));
        renderPage();
        const setup = await screen.findByRole("button", { name: "Set up image hosting" });
        await waitFor(() => expect(setup).toBeEnabled());
        fireEvent.click(setup);
        expect(await screen.findByText("Connect Cloudflare again to continue.")).toBeInTheDocument();
    });
});

describe("project states", () => {
    it("shows each step's true state, with 'needs a domain' neutral and a failure carrying its plain message", async () => {
        apiMock.getMedia.mockResolvedValue(project({
            steps: [
                step("verify_access", "DONE"),
                step("bucket", "DONE"),
                step("upload_worker", "RUNNING"),
                step("custom_domain", "NEEDS_INPUT", { need: "domain" }),
                step("zone_rules", "PENDING"),
                step("bucket_cors", "FAILED", { message: "Cloudflare access is missing permissions: R2 storage" }),
                step("smoke_test", "WAITING"),
            ],
        }));
        renderPage();

        const rail = await screen.findByRole("list", { name: "Setup progress" });
        const rows = within(rail).getAllByRole("listitem");
        expect(rows).toHaveLength(7);
        expect(within(rows[0]).getByText("Check access")).toBeInTheDocument();
        expect(within(rows[2]).getByText("Working")).toBeInTheDocument();
        expect(within(rows[3]).getByText("Needs a domain")).toBeInTheDocument();
        expect(within(rows[5]).getByText("Cloudflare access is missing permissions: R2 storage")).toBeInTheDocument();
        expect(within(rows[6]).getByText("Waiting for Cloudflare")).toBeInTheDocument();
        // "Needs a domain" is blocked, not failed: neutral ink, never the danger colour.
        expect(within(rows[3]).getByText("Needs a domain").className).not.toMatch(/danger/);
        expect(within(rows[5]).getByText(/missing permissions/).className).toMatch(/danger/);
        expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    });

    it("tells the person to turn on R2, links straight to it, and offers 'Check again' (no red)", async () => {
        apiMock.getMedia.mockResolvedValue(project({
            steps: [step("verify_access", "NEEDS_INPUT", { need: "r2" }), step("bucket", "PENDING")],
        }));
        renderPage();

        const link = await screen.findByRole("link", { name: /Open R2 in Cloudflare/ });
        expect(link.getAttribute("href")).toMatch(/^https:\/\/dash\.cloudflare\.com\/[^/]+\/r2\/overview$/);
        expect(link).toHaveAttribute("target", "_blank");
        expect(screen.getByText(/needs R2 turned on first/)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Check again" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    });

    describe("when setup needs a domain", () => {
        const needsDomain = () =>
            project({ steps: [step("verify_access", "DONE"), step("bucket", "DONE"), step("custom_domain", "NEEDS_INPUT", { need: "domain" }), step("zone_rules", "PENDING")] });

        it("offers the account's domains and one primary action, not a pointless Retry", async () => {
            apiMock.getMedia.mockResolvedValue(needsDomain());
            apiMock.getMediaCloudflareZones.mockResolvedValue({ zones: [{ id: "zone12345678", name: "example.com", status: "active" }] });
            renderPage();

            expect(await screen.findByRole("combobox", { name: "Domain" })).toBeInTheDocument();
            expect(apiMock.getMediaCloudflareZones).toHaveBeenCalledWith("acct12345678");
            expect(screen.getByText(/Choose one to go live/)).toBeInTheDocument();
            expect(screen.getByRole("button", { name: "Use this domain" })).toBeDisabled();
            expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
        });

        it("says so plainly when the account has no domains, and offers 'Check again'", async () => {
            apiMock.getMedia.mockResolvedValue(needsDomain());
            apiMock.getMediaCloudflareZones.mockResolvedValue({ zones: [] });
            renderPage();

            expect(await screen.findByText(/has no domains yet/)).toBeInTheDocument();
            expect(screen.getByRole("button", { name: "Check again" })).toBeInTheDocument();
            expect(screen.queryByRole("combobox", { name: "Domain" })).not.toBeInTheDocument();
        });

        it("asks to connect Cloudflare again when the domains can't be loaded", async () => {
            apiMock.getMedia.mockResolvedValue(needsDomain());
            apiMock.getMediaCloudflareZones.mockRejectedValue(new ApiRequestError(409, { message: "x" } as never));
            renderPage();

            expect(await screen.findByText("Couldn't load your domains. Connect Cloudflare again.")).toBeInTheDocument();
            expect(screen.getByRole("button", { name: "Reconnect Cloudflare" })).toBeInTheDocument();
        });
    });

    it("keeps the step list open while setup is still in progress (the content is the answer)", async () => {
        apiMock.getMedia.mockResolvedValue(project());
        renderPage();
        expect(await screen.findByRole("list", { name: "Setup progress" })).toBeVisible();
        expect(screen.queryByText("Setup details")).not.toBeInTheDocument();
    });

    it("retries with the stored account and reports 'not available yet' on 501", async () => {
        apiMock.getMedia.mockResolvedValue(project({ steps: ALL_STEPS.map((name) => step(name, name === "bucket" ? "FAILED" : "PENDING", name === "bucket" ? { message: "Cloudflare returned 500" } : null)) }));
        apiMock.setupMedia.mockRejectedValue(new ApiRequestError(501, { message: "x" } as never));
        renderPage();

        fireEvent.click(await screen.findByRole("button", { name: "Retry" }));

        await waitFor(() => expect(apiMock.setupMedia).toHaveBeenCalledWith({ cloudflareAccountId: "acct12345678" }));
        expect(await screen.findByText("Setup isn't available yet.")).toBeInTheDocument();
    });

    it("ready: shows the live image address with a copy action, and no Retry", async () => {
        searchParamsRef.current = new URLSearchParams("tab=settings");
        apiMock.getMedia.mockResolvedValue(project({
            state: "READY",
            publicHostname: "img.example.com",
            lastVerifiedAt: new Date(Date.now() - 120_000).toISOString(),
            steps: ALL_STEPS.map((name) => step(name, "DONE")),
        }));
        const writeText = vi.fn(async () => undefined);
        Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
        renderPage();

        expect(await screen.findByText("Ready")).toBeInTheDocument();
        expect(screen.getByText("https://img.example.com")).toBeInTheDocument();
        expect(screen.getByText("Last verified")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
        // Finished detail is collapsed by default (progressive disclosure); the state is said once, not twice.
        expect(screen.getByText("Setup details").closest("details")).not.toHaveAttribute("open");
        expect(screen.getAllByText("Ready")).toHaveLength(1);

        fireEvent.click(screen.getByRole("button", { name: "Copy image address" }));
        await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://img.example.com"));
    });

    it("needs reconnect: reports the last known state (images are live) and offers one action, Reconnect", async () => {
        apiMock.getMedia.mockResolvedValue(project({
            state: "NEEDS_RECONNECT",
            publicHostname: "img.example.com",
            lastVerifiedAt: "2026-10-05T00:00:00.000Z",
            steps: ALL_STEPS.map((name) => step(name, "DONE")),
        }));
        renderPage();

        expect(await screen.findByText("Live, couldn't verify")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Reconnect Cloudflare" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    });

    it("has no accessibility violations in the provisioning state", async () => {
        apiMock.getMedia.mockResolvedValue(project({ steps: ALL_STEPS.map((name) => step(name, name === "verify_access" ? "DONE" : "PENDING")) }));
        const { container } = renderPage();
        await screen.findByRole("list", { name: "Setup progress" });
        expect(await axe(container)).toHaveNoViolations();
    });

    it("has no accessibility violations in the not-connected state", async () => {
        apiMock.getMedia.mockResolvedValue({ configured: false, cloudflareSignedIn: false });
        const { container } = renderPage();
        await screen.findByRole("button", { name: "Connect Cloudflare" });
        expect(await axe(container)).toHaveNoViolations();
    });
});

describe("helpers", () => {
    it("derives the image hostname as a subdomain of the chosen domain", () => {
        expect(mediaImageHostname({ name: "example.com" })).toBe("img.example.com");
    });

    it("builds a setup request with a zone and hostname together, or neither", () => {
        const account = { id: "a1234567", name: "Acme" };
        expect(buildMediaSetupInput(account, { id: "z1234567", name: "example.com" })).toEqual({
            cloudflareAccountId: "a1234567", cloudflareAccountName: "Acme", zoneId: "z1234567", hostname: "img.example.com",
        });
        expect(buildMediaSetupInput(account, undefined)).toEqual({ cloudflareAccountId: "a1234567", cloudflareAccountName: "Acme" });
    });

    it("describes every step status in plain words", () => {
        expect(describeStep(step("x", "DONE"))).toBe("Done");
        expect(describeStep(step("x", "PENDING"))).toBe("Waiting");
        expect(describeStep(step("x", "PENDING"), true)).toBe("Not started");
        expect(describeStep(step("x", "NEEDS_INPUT", { need: "domain" }))).toBe("Needs a domain");
        expect(describeStep(step("x", "NEEDS_INPUT"))).toBe("Needs your input");
        expect(describeStep(step("x", "NEEDS_INPUT", { need: "r2" }))).toBe("Turn on R2 in Cloudflare");
        expect(describeStep(step("x", "FAILED"))).toBe("Didn't finish");
        expect(describeStep(step("x", "WAITING"))).toBe("Waiting for Cloudflare");
    });

    it("renders an unknown step key as-is instead of crashing", () => {
        render(<MediaStepRail steps={[step("brand_new_step", "DONE")]} />);
        expect(screen.getByText("brand_new_step")).toBeInTheDocument();
    });
});

describe("following setup while it runs", () => {
    const working = [step("verify_access", "RUNNING"), step("bucket", "PENDING")];
    const result = (overrides: Partial<Extract<MediaState, { configured: true }>>) => ({ locked: false as const, media: project(overrides) });

    it("re-reads every couple of seconds while a step is running", () => {
        expect(mediaRefetchInterval(result({ steps: working }))).toBe(2000);
    });

    it("stops when setup waits for the person, has failed, or is finished", () => {
        expect(mediaRefetchInterval(result({ steps: [step("verify_access", "NEEDS_INPUT", { need: "r2" })] }))).toBe(false);
        expect(mediaRefetchInterval(result({ steps: [step("verify_access", "FAILED", { message: "x" })] }))).toBe(false);
        expect(mediaRefetchInterval(result({ steps: [step("verify_access", "DONE")] }))).toBe(false);
        expect(mediaRefetchInterval(result({ state: "READY", steps: working }))).toBe(false);
    });

    it("keeps re-reading for a while after setup is started, even if the first re-read still looks settled", () => {
        const stale = result({ steps: [step("verify_access", "NEEDS_INPUT", { need: "r2" })] });
        expect(mediaRefetchInterval(stale, 10_000, 5_000)).toBe(1500);
        expect(mediaRefetchInterval(stale, 10_000, 10_001)).toBe(false);
    });

    it("shows the result of 'Check again' without a manual reload (the first re-read is still the old state)", async () => {
        const needsR2 = project({ steps: [step("verify_access", "NEEDS_INPUT", { need: "r2" }), step("bucket", "PENDING")] });
        const running = project({ steps: [step("verify_access", "RUNNING"), step("bucket", "PENDING")] });
        apiMock.getMedia.mockReset();
        apiMock.getMedia.mockResolvedValueOnce(needsR2).mockResolvedValueOnce(needsR2).mockResolvedValue(running);
        apiMock.setupMedia.mockResolvedValue({ projectId: "p1", state: "PROVISIONING" });
        renderPage();

        fireEvent.click(await screen.findByRole("button", { name: "Check again" }));
        expect(await screen.findByText("Working", {}, { timeout: 5000 })).toBeInTheDocument();
    });

    it("does not poll before setup exists or when Media is locked", () => {
        expect(mediaRefetchInterval(undefined)).toBe(false);
        expect(mediaRefetchInterval({ locked: true })).toBe(false);
        expect(mediaRefetchInterval({ locked: false, media: { configured: false, cloudflareSignedIn: true } as MediaState })).toBe(false);
    });
});
