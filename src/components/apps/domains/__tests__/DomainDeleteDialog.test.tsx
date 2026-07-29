import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainDeleteDialog } from "../DomainDeleteDialog";
import { api, type AppDomainRecord } from "@/lib/api";

vi.mock("@/lib/api", () => ({
    api: {
        removeAppDomain: vi.fn(),
    },
}));

vi.mock("sonner", () => ({
    toast: {
        error: vi.fn(),
        success: vi.fn(),
    },
}));

const domain: AppDomainRecord = {
    id: "domain-1",
    domain: "myclient.com",
    type: "custom",
    status: "active",
    expectedIp: "13.201.10.20",
    resolvedIps: ["13.201.10.20"],
    lastCheckedAt: "2026-04-30T12:00:00.000Z",
    connectedAt: "2026-04-30T11:00:00.000Z",
    sslStatus: null,
    primary: false,
    enabled: true,
    createdAt: "2026-04-30T10:00:00.000Z",
    errorMessage: null,
};

function renderDialog() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });

    return render(
        <QueryClientProvider client={queryClient}>
            <DomainDeleteDialog
                appId="app-1"
                domain={domain}
                open
                onOpenChange={vi.fn()}
                onSuccess={vi.fn()}
            />
        </QueryClientProvider>,
    );
}

describe("DomainDeleteDialog", () => {
    beforeEach(() => {
        vi.mocked(api.removeAppDomain).mockReset();
    });

    it("shows the domain name in the dialog", () => {
        renderDialog();

        expect(screen.getByText("myclient.com")).toBeVisible();
    });

    it("does not call the API when canceled", () => {
        renderDialog();

        fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

        expect(api.removeAppDomain).not.toHaveBeenCalled();
    });
});
