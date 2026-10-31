import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ComposeServicesCard } from "../ComposeServicesCard";
import { api } from "@/lib/api";

vi.mock("@/lib/api", async () => {
    const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
    return { ...actual, api: { ...actual.api, getComposeServices: vi.fn() } };
});

const show = (services: unknown) => vi.mocked(api.getComposeServices).mockResolvedValue({ services } as never);
const renderCard = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}><ComposeServicesCard appId="app-1" /></QueryClientProvider>);
};

// Doc 67: a compose project's services, with its databases marked. The database itself belongs to the compose file.
describe("ComposeServicesCard", () => {
    beforeEach(() => vi.clearAllMocks());

    it("lists each service with its role and marks the database with its engine and logo", async () => {
        show([
            { name: "app", role: "app", primary: true, built: true },
            { name: "db", image: "mysql:8.4", role: "database", kind: "mysql" },
            { name: "files", image: "minio/minio:latest", role: "supporting" },
        ]);
        const { container } = renderCard();
        expect(await screen.findByText("Services")).toBeTruthy();
        expect(screen.getByText("app")).toBeTruthy();
        expect(screen.getByText("Public app")).toBeTruthy();
        expect(screen.getByText("Built from your code")).toBeTruthy();
        expect(screen.getByText("db")).toBeTruthy();
        expect(screen.getByText("Database · MySQL")).toBeTruthy();
        expect(screen.getByText("mysql:8.4")).toBeTruthy();
        expect(screen.getByText("Supporting")).toBeTruthy();
        expect([...container.querySelectorAll("img")].map((img) => img.getAttribute("src"))).toEqual(["/brands/mysql.svg"]);
    });

    it("says the compose file owns its databases, only when there is one", async () => {
        show([{ name: "app", role: "app", primary: true }, { name: "db", image: "postgres:15", role: "database", kind: "postgres" }]);
        const withDb = renderCard();
        expect(await screen.findByText("Your compose file creates and runs this database.")).toBeTruthy();
        withDb.unmount();

        show([{ name: "web", role: "app", primary: true }]);
        renderCard();
        await screen.findByText("web");
        expect(screen.queryByText(/compose file creates/)).toBeNull();
    });

    it("shows nothing for an app that is not a compose project, or when the list cannot be read", async () => {
        show([]);
        const empty = renderCard();
        await waitFor(() => expect(api.getComposeServices).toHaveBeenCalled());
        expect(empty.container.innerHTML).toBe("");
        empty.unmount();

        vi.mocked(api.getComposeServices).mockRejectedValue(new Error("boom"));
        const failed = renderCard();
        await waitFor(() => expect(api.getComposeServices).toHaveBeenCalledTimes(2));
        expect(failed.container.innerHTML).toBe("");
    });
});
