import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddCustomDomainModal } from "../AddCustomDomainModal";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({
    api: {
        addCustomDomain: vi.fn(),
    },
}));

vi.mock("sonner", () => ({
    toast: {
        error: vi.fn(),
        success: vi.fn(),
    },
}));

function renderModal() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });

    return render(
        <QueryClientProvider client={queryClient}>
            <AddCustomDomainModal
                appId="app-1"
                open
                onOpenChange={vi.fn()}
                onSuccess={vi.fn()}
            />
        </QueryClientProvider>,
    );
}

describe("AddCustomDomainModal", () => {
    beforeEach(() => {
        vi.mocked(api.addCustomDomain).mockReset();
    });

    it("rejects empty input with an error", () => {
        renderModal();

        fireEvent.click(screen.getByRole("button", { name: /add domain/i }));

        expect(screen.getByText("Domain is required")).toBeVisible();
        expect(api.addCustomDomain).not.toHaveBeenCalled();
    });

    it("rejects IP address input with an error", () => {
        renderModal();

        fireEvent.change(screen.getByLabelText(/your domain/i), {
            target: { value: "192.168.1.10" },
        });
        fireEvent.click(screen.getByRole("button", { name: /add domain/i }));

        expect(screen.getByText("IP addresses are not supported")).toBeVisible();
        expect(api.addCustomDomain).not.toHaveBeenCalled();
    });
});
