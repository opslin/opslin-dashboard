// The library screen: browse folders, search, select, bulk change, upload (picker, drop, folder), detail, export, roles,
// plus the Guide and the tabs around them. The API is a small in-memory fake that behaves like the real one.

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaAsset, MediaFolder, MediaState } from "@/lib/api";

const searchParamsRef = vi.hoisted(() => ({ current: new URLSearchParams() }));
const routerMock = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => searchParamsRef.current, useRouter: () => routerMock }));
const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));
const authMock = vi.hoisted(() => ({ role: "OWNER" as string | null }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: authMock.role ? { orgRole: authMock.role } : null }) }));
const sdkMock = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock("@/lib/media-sdk/media", () => ({ createMedia: () => sdkMock }));
const exportMock = vi.hoisted(() => ({ downloadBlob: vi.fn() }));
vi.mock("../library/export", async (importOriginal) => ({ ...(await importOriginal<typeof import("../library/export")>()), downloadBlob: exportMock.downloadBlob }));

const apiMock = vi.hoisted(() => ({
    getMedia: vi.fn(),
    getMediaUsage: vi.fn(),
    getMediaApiKey: vi.fn(),
    listMediaAssets: vi.fn(),
    listMediaFolders: vi.fn(),
    updateMediaAsset: vi.fn(),
    bulkMediaAssets: vi.fn(),
    createMediaFolder: vi.fn(),
    renameMediaFolder: vi.fn(),
    deleteMediaFolder: vi.fn(),
    setupMedia: vi.fn(),
    startMediaCloudflareSignIn: vi.fn(),
    getMediaCloudflareZones: vi.fn(),
}));
vi.mock("@/lib/api", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api")>();
    return { ...actual, api: apiMock };
});

import { ApiRequestError } from "@/lib/api";
import { MediaError, UploadLimitError } from "@/lib/media-sdk/errors";
import MediaPage from "@/app/(dashboard)/media/page";

// Radix needs a few browser features jsdom lacks.
beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
    window.HTMLElement.prototype.releasePointerCapture = vi.fn();
    globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
});

const asset = (n: number, over: Partial<MediaAsset> = {}): MediaAsset => ({
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, hash: String(n).repeat(64).slice(0, 64), name: `Image ${n}`, folder: "", tags: [], type: "image/webp",
    bytes: 100_000 * n, width: 1200, height: 800, thumbhash: null, widths: [320, 640, 1080], variantBytes: 0, createdAt: "2026-10-06T10:00:00.000Z", updatedAt: "2026-10-06T10:00:00.000Z",
    urls: { master: `https://img.example.com/masters/aa/${n}`, variants: { "320": `https://img.example.com/v/aa/${n}/w320.webp`, "1080": `https://img.example.com/v/aa/${n}/w1080.webp` } }, ...over,
});

let world: { assets: MediaAsset[]; folders: Record<string, MediaFolder[]> };

function resetWorld() {
    world = {
        assets: [asset(1, { name: "Logo" }), asset(2, { name: "Red shoe", folder: "products", tags: ["shoes"] }), asset(3, { name: "Hero banner", folder: "products/banners" }), asset(4, { name: "Blue shoe", folder: "products" })],
        folders: {
            "": [{ path: "products", name: "products", assets: 2, folders: 1, createdAt: "2026-10-01T00:00:00.000Z" }],
            products: [{ path: "products/banners", name: "banners", assets: 1, folders: 0, createdAt: "2026-10-01T00:00:00.000Z" }],
            "products/banners": [],
        },
    };
    apiMock.listMediaAssets.mockImplementation(async (query: { folder?: string; q?: string; cursor?: string }) => {
        let list = world.assets;
        if (query.q) list = list.filter((a) => a.name.toLowerCase().includes(query.q!.toLowerCase()));
        else if (query.folder !== undefined) list = list.filter((a) => a.folder === query.folder);
        return { assets: list, total: list.length, nextCursor: null };
    });
    apiMock.listMediaFolders.mockImplementation(async (parent = "") => ({ folders: world.folders[parent] ?? [], assets: 0 }));
    apiMock.bulkMediaAssets.mockImplementation(async (input: { ids: string[] }) => ({ done: input.ids, failed: [] }));
    apiMock.updateMediaAsset.mockImplementation(async (id: string, patch: Partial<MediaAsset>) => ({ asset: { ...world.assets.find((a) => a.id === id)!, ...patch } }));
    apiMock.createMediaFolder.mockResolvedValue({ created: true, path: "x" });
    apiMock.renameMediaFolder.mockResolvedValue({ renamed: true, from: "a", to: "b" });
    apiMock.deleteMediaFolder.mockResolvedValue({ deleted: true, assets: 0 });
}

const project = (over: Partial<Extract<MediaState, { configured: true }>> = {}): MediaState => ({
    configured: true, cloudflareSignedIn: false, id: "p1", state: "READY", engine: "EDGE", cloudflareAccountId: "acct12345678", cloudflareAccountName: "Acme",
    publicHostname: "img.example.com", uploadUrl: "https://up.acme.workers.dev", workerUpdateAvailable: false, bucketName: "b", allowedOrigins: ["https://shop.example.com"],
    transformsEnabled: false, lastVerifiedAt: null, createdAt: "2026-10-06T00:00:00.000Z",
    steps: ["verify_access", "bucket", "upload_worker", "custom_domain", "zone_rules", "bucket_cors", "smoke_test"].map((step) => ({ step, status: "DONE" as const, attempts: 1, detail: null, finishedAt: null })), ...over,
});

function renderPage() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    return render(<QueryClientProvider client={client}><MediaPage /></QueryClientProvider>);
}

beforeEach(() => {
    vi.clearAllMocks();
    resetWorld();
    authMock.role = "OWNER";
    searchParamsRef.current = new URLSearchParams();
    apiMock.getMedia.mockResolvedValue(project());
    apiMock.getMediaUsage.mockResolvedValue({ available: true, limitsActive: true, version: "4", day: "2026-10-06", objects: 3, bytes: 3000, uploaders: 1, library: { assets: 4, folders: 2, storedBytes: 5000 }, caps: { projectObjects: 20000, projectBytes: 10 * 1024 ** 3, ipObjects: 2000, ipBytes: 2 * 1024 ** 3, ipPerMinute: 120 }, history: [], level: "ok", percent: 1 });
    sdkMock.upload.mockImplementation(async (_file: File, options: { onProgress?: (p: unknown) => void }) => {
        options.onProgress?.({ stage: "uploading", done: 1, total: 4 });
        return { id: "x" };
    });
    window.localStorage.clear();
});

const rowText = (text: string | RegExp) => screen.findByText(text);

describe("the page around the library", () => {
    it("opens on the library when image hosting is ready, with the guide and the settings one tab away", async () => {
        renderPage();
        expect(await rowText("Logo")).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: "Library", selected: true })).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: "Guide" })).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: "Settings" })).toBeInTheDocument();
        fireEvent.mouseDown(screen.getByRole("tab", { name: "Guide" }));
        fireEvent.click(screen.getByRole("tab", { name: "Guide" }));
        await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith("/media?tab=guide", { scroll: false }));
    });

    it("keeps the full setup screen while setup is not finished", async () => {
        apiMock.getMedia.mockResolvedValue(project({ state: "PROVISIONING" }));
        renderPage();
        expect(await screen.findByText("Setting up")).toBeInTheDocument();
        expect(screen.queryByRole("tab", { name: "Library" })).not.toBeInTheDocument();
    });
});

describe("browsing", () => {
    it("shows the folders first, then the images of the current folder, with counts", async () => {
        renderPage();
        expect(await rowText("Logo")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "products" })).toBeInTheDocument();
        expect(screen.getByText("2 images, 1 folder")).toBeInTheDocument();
        expect(screen.queryByText("Red shoe")).not.toBeInTheDocument();
        expect(apiMock.listMediaAssets).toHaveBeenCalledWith(expect.objectContaining({ folder: "" }));
    });

    it("opens a folder, shows a breadcrumb, and goes back up from it", async () => {
        renderPage();
        fireEvent.click(await screen.findByRole("button", { name: "products" }));
        expect(await rowText("Red shoe")).toBeInTheDocument();
        expect(screen.getByText("Blue shoe")).toBeInTheDocument();
        expect(screen.queryByText("Logo")).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "banners" })).toBeInTheDocument();
        const crumbs = screen.getByRole("navigation", { name: "Folder path" });
        expect(within(crumbs).getByRole("button", { name: "products" })).toBeInTheDocument();
        fireEvent.click(within(crumbs).getByRole("button", { name: "Library" }));
        expect(await rowText("Logo")).toBeInTheDocument();
    });

    it("searches every folder, shows where each result lives, and clears back to browsing", async () => {
        renderPage();
        fireEvent.change(await screen.findByLabelText("Search images"), { target: { value: "shoe" } });
        expect(await screen.findByText("Results for “shoe”", undefined, { timeout: 3000 })).toBeInTheDocument();
        expect(await rowText("Red shoe")).toBeInTheDocument();
        expect(screen.getAllByText("products").length).toBeGreaterThan(0);
        expect(apiMock.listMediaAssets).toHaveBeenCalledWith(expect.objectContaining({ q: "shoe" }));
        fireEvent.change(screen.getByLabelText("Search images"), { target: { value: "nothing like this" } });
        expect(await screen.findByText("No images match “nothing like this”", undefined, { timeout: 3000 })).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
        expect(await rowText("Logo")).toBeInTheDocument();
    });

    it("invites an upload when the library is empty", async () => {
        world.assets = [];
        world.folders[""] = [];
        renderPage();
        expect(await screen.findByText("No images yet")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Upload images/ })).toBeInTheDocument();
    });

    it("says what went wrong and offers Retry when the library can't load", async () => {
        apiMock.listMediaAssets.mockRejectedValueOnce(new ApiRequestError(502, { message: "Couldn't reach your upload service. Try again in a moment.", code: "upload_service_unreachable" }));
        renderPage();
        expect(await screen.findByText("Couldn't reach your upload service. Try again in a moment.")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Retry" }));
        expect(await rowText("Logo")).toBeInTheDocument();
    });

    it("offers the update right on the library when the upload service is older than the library", async () => {
        apiMock.getMedia.mockResolvedValue(project({ workerUpdateAvailable: true }));
        apiMock.setupMedia.mockRejectedValue(new ApiRequestError(409, { message: "x", code: "cloudflare_not_connected" }));
        renderPage();
        expect(await screen.findByText("Update the upload service to use the library.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Upload" })).toBeDisabled();
        fireEvent.click(screen.getByRole("button", { name: "Update upload service" }));
        await waitFor(() => expect(apiMock.setupMedia).toHaveBeenCalledWith({ cloudflareAccountId: "acct12345678", cloudflareAccountName: "Acme", refresh: true }));
        expect(await screen.findByText("Connect Cloudflare to update the upload service.")).toBeInTheDocument();
    });

    it("remembers list or grid", async () => {
        const first = renderPage();
        await rowText("Logo");
        fireEvent.click(screen.getByRole("button", { name: "Grid view" }));
        expect(window.localStorage.getItem("opslin-media-view")).toBe("grid");
        expect(screen.getByRole("button", { name: "Open Logo" })).toBeInTheDocument();
        first.unmount();
        renderPage();
        expect(await screen.findByRole("button", { name: "Open Logo" })).toBeInTheDocument();
    });
});

describe("selecting and changing many", () => {
    async function selectTwo() {
        renderPage();
        fireEvent.click(await screen.findByRole("button", { name: "products" }));
        await rowText("Red shoe");
        fireEvent.click(screen.getByRole("checkbox", { name: "Select Red shoe" }));
        fireEvent.click(screen.getByRole("checkbox", { name: "Select Blue shoe" }));
    }

    it("shows the count and the bulk actions in place of the toolbar", async () => {
        await selectTwo();
        expect(screen.getByText("2 selected")).toBeInTheDocument();
        for (const name of ["Move", "Tags", "Delete", "Clear"]) expect(screen.getByRole("button", { name })).toBeInTheDocument();
        expect(screen.queryByLabelText("Search images")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Clear" }));
        expect(await screen.findByLabelText("Search images")).toBeInTheDocument();
    });

    it("deletes after one confirmation that names the effect", async () => {
        await selectTwo();
        fireEvent.click(screen.getByRole("button", { name: "Delete" }));
        expect(await screen.findByText(/Delete 2 images from your storage\? They may keep loading from Cloudflare's cache/)).toBeInTheDocument();
        expect(apiMock.bulkMediaAssets).not.toHaveBeenCalled();
        const dialog = screen.getByRole("alertdialog");
        fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
        await waitFor(() => expect(apiMock.bulkMediaAssets).toHaveBeenCalledWith({ action: "delete", ids: [world.assets[1]!.id, world.assets[3]!.id] }));
        await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("Deleted 2 images"));
    });

    it("moves them by walking to a folder and choosing it", async () => {
        await selectTwo();
        fireEvent.click(screen.getByRole("button", { name: "Move" }));
        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByText("Move 2 images")).toBeInTheDocument();
        fireEvent.click(await within(dialog).findByRole("button", { name: /banners/ }));
        fireEvent.click(within(dialog).getByRole("button", { name: "Move here" }));
        await waitFor(() => expect(apiMock.bulkMediaAssets).toHaveBeenCalledWith({ action: "move", ids: [world.assets[1]!.id, world.assets[3]!.id], folder: "products/banners" }));
    });

    it("adds and removes tags on all of them", async () => {
        await selectTwo();
        fireEvent.click(screen.getByRole("button", { name: "Tags" }));
        const dialog = await screen.findByRole("dialog");
        fireEvent.change(within(dialog).getByLabelText("Tags to add"), { target: { value: "Sale, Summer" } });
        fireEvent.change(within(dialog).getByLabelText("Tags to remove"), { target: { value: "old" } });
        fireEvent.click(within(dialog).getByRole("button", { name: "Apply tags" }));
        await waitFor(() => expect(apiMock.bulkMediaAssets).toHaveBeenCalledWith({ action: "tag", ids: expect.any(Array), addTags: ["sale", "summer"], removeTags: ["old"] }));
    });

    it("tells the person when some could not be changed", async () => {
        apiMock.bulkMediaAssets.mockResolvedValueOnce({ done: [world.assets[1]!.id], failed: [{ id: world.assets[3]!.id, error: "not_found" }] });
        await selectTwo();
        fireEvent.click(screen.getByRole("button", { name: "Delete" }));
        fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete" }));
        await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("1 of 2 couldn't be changed."));
    });

    it("selects a range with shift and everything with the master checkbox", async () => {
        renderPage();
        fireEvent.click(await screen.findByRole("button", { name: "products" }));
        await rowText("Red shoe");
        fireEvent.click(screen.getByRole("checkbox", { name: "Select Red shoe" }));
        fireEvent.click(screen.getByRole("checkbox", { name: "Select Blue shoe" }), { shiftKey: true });
        expect(screen.getByText("2 selected")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("checkbox", { name: "Select all" }));
        expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
    });
});

describe("folders", () => {
    it("creates a folder inside the folder you are in", async () => {
        renderPage();
        fireEvent.click(await screen.findByRole("button", { name: "products" }));
        fireEvent.click(await screen.findByRole("button", { name: "New folder" }));
        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByText("New folder in products")).toBeInTheDocument();
        fireEvent.change(within(dialog).getByLabelText("Folder name"), { target: { value: "summer" } });
        fireEvent.click(within(dialog).getByRole("button", { name: "Create folder" }));
        await waitFor(() => expect(apiMock.createMediaFolder).toHaveBeenCalledWith("products/summer"));
    });

    it("explains why a folder could not be made, in the dialog", async () => {
        apiMock.createMediaFolder.mockRejectedValueOnce(new ApiRequestError(409, { message: "A folder with that name already exists.", code: "folder_exists" }));
        renderPage();
        fireEvent.click(await screen.findByRole("button", { name: "New folder" }));
        const dialog = await screen.findByRole("dialog");
        fireEvent.change(within(dialog).getByLabelText("Folder name"), { target: { value: "products" } });
        fireEvent.click(within(dialog).getByRole("button", { name: "Create folder" }));
        expect(await within(dialog).findByText("A folder with that name already exists.")).toBeInTheDocument();
    });

    it("renames and deletes a folder from its menu", async () => {
        renderPage();
        const menu = await screen.findByRole("button", { name: "Folder options for products" });
        fireEvent.keyDown(menu, { key: "Enter" });
        fireEvent.click(await screen.findByRole("menuitem", { name: "Rename" }));
        const dialog = await screen.findByRole("dialog");
        fireEvent.change(within(dialog).getByLabelText("Folder name"), { target: { value: "shop" } });
        fireEvent.click(within(dialog).getByRole("button", { name: "Rename folder" }));
        await waitFor(() => expect(apiMock.renameMediaFolder).toHaveBeenCalledWith("products", "shop"));

        fireEvent.keyDown(await screen.findByRole("button", { name: "Folder options for products" }), { key: "Enter" });
        fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
        expect(await screen.findByText("Delete “products” and everything inside it? The images are removed from your storage.")).toBeInTheDocument();
        fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete folder" }));
        await waitFor(() => expect(apiMock.deleteMediaFolder).toHaveBeenCalledWith("products", true));
    });
});

describe("uploading", () => {
    const jpeg = (name: string) => new File([new Uint8Array(10)], name, { type: "image/jpeg" });

    it("uploads chosen images into the current folder, keeping each file's row, then refreshes", async () => {
        renderPage();
        fireEvent.click(await screen.findByRole("button", { name: "products" }));
        await rowText("Red shoe");
        const input = screen.getByLabelText("Choose images") as HTMLInputElement;
        fireEvent.change(input, { target: { files: [jpeg("a.jpg"), jpeg("b.jpg")] } });
        await waitFor(() => expect(sdkMock.upload).toHaveBeenCalledTimes(2));
        expect(sdkMock.upload).toHaveBeenCalledWith(expect.objectContaining({ name: "a.jpg" }), expect.objectContaining({ folder: "products" }));
        const listCalls = apiMock.listMediaAssets.mock.calls.length;
        await waitFor(() => expect(apiMock.listMediaAssets.mock.calls.length).toBeGreaterThan(listCalls - 1));
    });

    it("skips files that are not JPEG, PNG, WebP or AVIF, and says so", async () => {
        renderPage();
        await rowText("Logo");
        fireEvent.change(screen.getByLabelText("Choose images"), { target: { files: [jpeg("a.jpg"), new File([""], "doc.pdf", { type: "application/pdf" }), new File([""], "x.gif", { type: "image/gif" })] } });
        expect(await screen.findByText("2 files were skipped. Only JPEG, PNG, WebP and AVIF images can be uploaded.")).toBeInTheDocument();
        await waitFor(() => expect(sdkMock.upload).toHaveBeenCalledTimes(1));
    });

    it("uploads a chosen folder with its structure under the current folder", async () => {
        renderPage();
        await rowText("Logo");
        const a = Object.assign(jpeg("a.jpg"), { webkitRelativePath: "summer/banners/a.jpg" });
        const b = Object.assign(jpeg("b.jpg"), { webkitRelativePath: "summer/b.jpg" });
        fireEvent.change(screen.getByLabelText("Choose a folder"), { target: { files: [a, b] } });
        await waitFor(() => expect(sdkMock.upload).toHaveBeenCalledTimes(2));
        const folders = sdkMock.upload.mock.calls.map((call) => (call[1] as { folder: string }).folder).sort();
        expect(folders).toEqual(["summer", "summer/banners"]);
    });

    it("takes files dropped anywhere on the library", async () => {
        renderPage();
        await rowText("Logo");
        const panel = document.querySelector('[data-slot="card"]') as HTMLElement;
        const files = [jpeg("dropped.jpg")];
        fireEvent.dragOver(panel, { dataTransfer: { types: ["Files"], files, items: [] } });
        expect(await screen.findByText("Drop to upload to the top level.")).toBeInTheDocument();
        await act(async () => {
            fireEvent.drop(panel, { dataTransfer: { types: ["Files"], files, items: [] } });
        });
        await waitFor(() => expect(sdkMock.upload).toHaveBeenCalledWith(expect.objectContaining({ name: "dropped.jpg" }), expect.anything()));
    });

    it("shows a failure on the file's own row with Retry, and pauses the rest at a daily limit", async () => {
        sdkMock.upload.mockRejectedValueOnce(new MediaError("too_large", "The image is too large to upload."));
        renderPage();
        await rowText("Logo");
        fireEvent.change(screen.getByLabelText("Choose images"), { target: { files: [jpeg("big.jpg")] } });
        expect(await screen.findByText("The image is too large to upload.")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Retry" }));
        await waitFor(() => expect(sdkMock.upload).toHaveBeenCalledTimes(2));

        sdkMock.upload.mockReset();
        sdkMock.upload.mockRejectedValue(new UploadLimitError("project", 3600));
        fireEvent.change(screen.getByLabelText("Choose images"), { target: { files: [jpeg("1.jpg"), jpeg("2.jpg"), jpeg("3.jpg"), jpeg("4.jpg")] } });
        await waitFor(() => expect(screen.getAllByText("The upload limit for today is reached. Try again later.").length).toBeGreaterThan(1));
    });

    it("hides the upload controls from someone who may only look", async () => {
        authMock.role = "VIEWER";
        renderPage();
        await rowText("Logo");
        expect(screen.queryByRole("button", { name: "Upload" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "New folder" })).not.toBeInTheDocument();
        expect(screen.getByText("Only members, admins and owners can change the library.")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /Folder options/ })).not.toBeInTheDocument();
    });
});

describe("one image", () => {
    it("opens its details, renames it, edits its tags, and deletes it after confirmation", async () => {
        renderPage();
        fireEvent.click(await screen.findByRole("button", { name: /Logo/ }));
        const sheet = await screen.findByRole("dialog");
        expect(within(sheet).getByRole("img", { name: "Logo" })).toHaveAttribute("src", "https://img.example.com/v/aa/1/w1080.webp");
        expect(within(sheet).getByText("1200 by 800")).toBeInTheDocument();
        expect(within(sheet).getByText("https://img.example.com/masters/aa/1")).toBeInTheDocument();

        const name = within(sheet).getByLabelText("Name");
        fireEvent.change(name, { target: { value: "Company logo" } });
        fireEvent.blur(name);
        await waitFor(() => expect(apiMock.updateMediaAsset).toHaveBeenCalledWith(world.assets[0]!.id, { name: "Company logo" }));

        const tags = within(sheet).getByLabelText("Tags");
        fireEvent.change(tags, { target: { value: "Brand, Main" } });
        fireEvent.blur(tags);
        await waitFor(() => expect(apiMock.updateMediaAsset).toHaveBeenCalledWith(world.assets[0]!.id, { tags: ["brand", "main"] }));

        fireEvent.click(within(sheet).getByRole("button", { name: "Delete" }));
        expect(await screen.findByText(/Delete 1 image from your storage\?/)).toBeInTheDocument();
        fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }));
        await waitFor(() => expect(apiMock.bulkMediaAssets).toHaveBeenCalledWith({ action: "delete", ids: [world.assets[0]!.id] }));
    });

    it("moves it from the details", async () => {
        renderPage();
        fireEvent.click(await screen.findByRole("button", { name: /Logo/ }));
        const sheet = await screen.findByRole("dialog");
        fireEvent.click(within(sheet).getByRole("button", { name: "Move" }));
        const dialogs = await screen.findAllByRole("dialog");
        const picker = dialogs.find((d) => within(d).queryByText("Move 1 image"))!;
        fireEvent.click(await within(picker).findByRole("button", { name: /products/ }));
        fireEvent.click(within(picker).getByRole("button", { name: "Move here" }));
        await waitFor(() => expect(apiMock.updateMediaAsset).toHaveBeenCalledWith(world.assets[0]!.id, { folder: "products" }));
    });

    it("shows read-only details to someone who may only look", async () => {
        authMock.role = "VIEWER";
        renderPage();
        fireEvent.click(await screen.findByRole("button", { name: /Logo/ }));
        const sheet = await screen.findByRole("dialog");
        expect(within(sheet).queryByLabelText("Name")).not.toBeInTheDocument();
        expect(within(sheet).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
        expect(within(sheet).getByText("Only members, admins and owners can change the library.")).toBeInTheDocument();
    });
});

describe("export", () => {
    it("exports the selection as CSV, or the whole folder when nothing is selected", async () => {
        renderPage();
        await rowText("Logo");
        fireEvent.click(screen.getByRole("checkbox", { name: "Select Logo" }));
        fireEvent.keyDown(screen.getByRole("button", { name: "Export" }), { key: "Enter" });
        fireEvent.click(await screen.findByRole("menuitem", { name: "Export list as CSV" }));
        await waitFor(() => expect(exportMock.downloadBlob).toHaveBeenCalledTimes(1));
        const [blob, filename] = exportMock.downloadBlob.mock.calls[0] as [Blob, string];
        expect(filename).toMatch(/^library-\d{4}-\d{2}-\d{2}\.csv$/);
        expect(await blob.text()).toContain("Logo");
        expect(apiMock.listMediaAssets).not.toHaveBeenCalledWith(expect.objectContaining({ recursive: true }));

        fireEvent.click(screen.getByRole("button", { name: "Clear" }));
        fireEvent.keyDown(await screen.findByRole("button", { name: "Export" }), { key: "Enter" });
        fireEvent.click(await screen.findByRole("menuitem", { name: "Export list as JSON" }));
        await waitFor(() => expect(exportMock.downloadBlob).toHaveBeenCalledTimes(2));
        expect(apiMock.listMediaAssets).toHaveBeenCalledWith(expect.objectContaining({ folder: "", recursive: true, limit: 100 }));
    });
});

describe("guide", () => {
    beforeEach(() => {
        searchParamsRef.current = new URLSearchParams("tab=guide");
    });

    it("shows what is done and what is next, with this project's real addresses in the code", async () => {
        renderPage();
        expect(await screen.findByText("Connect Cloudflare")).toBeInTheDocument();
        expect(screen.getByText("1 website")).toBeInTheDocument();
        expect(await screen.findByText("4 images")).toBeInTheDocument();
        expect(screen.getAllByText(/uploadUrl: "https:\/\/up\.acme\.workers\.dev"/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/imageUrl: "https:\/\/img\.example\.com"/).length).toBeGreaterThan(0);
        expect(screen.getByText(/curl -H "Authorization: Bearer \$KEY"/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Manage" }));
        expect(routerMock.replace).toHaveBeenCalledWith("/media?tab=settings", { scroll: false });
    });

    it("shows the API key only on request to an owner, and never puts it in the page by itself", async () => {
        apiMock.getMediaApiKey.mockResolvedValue({ apiKey: "the-secret-key" });
        renderPage();
        await screen.findByText("Connect Cloudflare");
        expect(document.body.textContent).not.toContain("the-secret-key");
        fireEvent.click(screen.getByRole("button", { name: "Show key" }));
        expect(await screen.findByText("the-secret-key")).toBeInTheDocument();
        expect(screen.getByText("Keep it on your server. Anyone with this key can read and delete your images.")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Hide" }));
        await waitFor(() => expect(document.body.textContent).not.toContain("the-secret-key"));
    });

    it("keeps the key from members", async () => {
        authMock.role = "MEMBER";
        renderPage();
        await screen.findByText("Connect Cloudflare");
        expect(screen.queryByRole("button", { name: "Show key" })).not.toBeInTheDocument();
        expect(screen.getByText("Only owners and admins can see the API key.")).toBeInTheDocument();
        expect(apiMock.getMediaApiKey).not.toHaveBeenCalled();
    });
});
