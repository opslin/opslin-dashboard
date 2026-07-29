/**
 * Unit tests for ServerCapacityCard.
 *
 * Validates Requirements 1.5, 1.6 — the dashboard surfaces the capacity
 * advisory's verdict and the human-readable reason when the safe VU
 * ceiling is 0.
 */

import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ServerCapacityCard } from "./server-capacity-card";
import { ApiRequestError, api, type CapacityAdvisory } from "@/lib/api";

vi.mock("@/lib/api", async () => {
    const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
    return {
        ...actual,
        api: {
            ...actual.api,
            getCapacityAdvisory: vi.fn(),
        },
    };
});

function renderWithQueryClient(ui: ReactElement) {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
    return render(
        <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    );
}

const HEALTHY_ADVISORY: CapacityAdvisory = {
    serverId: "test",
    safeVuCeiling: 56,
    recommendedVu: 10,
    planMaxVu: 10,
    reason: "Safe for up to 56 VUs based on 4 cores, 6144 MB available",
    serverProfile: {
        cpuCores: 4,
        totalMemMb: 8192,
        availableMemMb: 6144,
        loadAvg1m: 0.5,
        containerMemLimitMb: null,
    },
    dangerZone: false,
};

const ZERO_CEILING_ADVISORY: CapacityAdvisory = {
    serverId: "test",
    safeVuCeiling: 0,
    recommendedVu: 0,
    planMaxVu: 10,
    reason: "Server too resource-constrained for VU testing (1 cores, 512 MB RAM)",
    serverProfile: {
        cpuCores: 1,
        totalMemMb: 512,
        availableMemMb: 256,
        loadAvg1m: 1.5,
        containerMemLimitMb: null,
    },
    dangerZone: false,
};

describe("ServerCapacityCard", () => {
    beforeEach(() => {
        vi.mocked(api.getCapacityAdvisory).mockReset();
    });

    it("renders server profile and capacity verdict on success", async () => {
        vi.mocked(api.getCapacityAdvisory).mockResolvedValue(HEALTHY_ADVISORY);

        renderWithQueryClient(<ServerCapacityCard serverId="test" />);

        // Server profile fields
        await waitFor(() => {
            expect(screen.getByText(/4 CPU cores/)).toBeInTheDocument();
        });
        expect(screen.getByText(/8\.00 GB RAM/)).toBeInTheDocument();
        expect(screen.getByText(/6\.00 GB available/)).toBeInTheDocument();
        expect(screen.getByText(/0\.50/)).toBeInTheDocument();

        // Capacity verdict
        expect(screen.getByText(/Safe for/)).toBeInTheDocument();
        expect(screen.getByText("56")).toBeInTheDocument();
        expect(screen.getByText(/Recommended:/)).toBeInTheDocument();
        expect(screen.getByText(/Plan max:/)).toBeInTheDocument();

        // Both 10s should appear (recommendedVu and planMaxVu)
        const tens = screen.getAllByText("10");
        expect(tens.length).toBeGreaterThanOrEqual(2);

        // Multiple "VUs" labels appear (Safe for / Recommended / Plan max)
        const vuLabels = screen.getAllByText(/VUs/);
        expect(vuLabels.length).toBeGreaterThanOrEqual(3);

        expect(api.getCapacityAdvisory).toHaveBeenCalledWith("test");
    });

    it("shows advisory reason when safe VU ceiling is 0", async () => {
        vi.mocked(api.getCapacityAdvisory).mockResolvedValue(ZERO_CEILING_ADVISORY);

        renderWithQueryClient(<ServerCapacityCard serverId="test" />);

        await waitFor(() => {
            expect(screen.getByText(/VU testing not available/)).toBeInTheDocument();
        });
        expect(
            screen.getByText(/Server too resource-constrained for VU testing/)
        ).toBeInTheDocument();

        // The "Safe for ... VUs" / Recommended / Plan max block must NOT render
        // because the alert branch is taken instead.
        expect(screen.queryByText(/Safe for/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Recommended:/)).not.toBeInTheDocument();
    });

    it("shows a loading skeleton while the advisory request is pending", () => {
        // Never-resolving promise keeps the query in `isLoading` state.
        vi.mocked(api.getCapacityAdvisory).mockReturnValue(
            new Promise(() => {})
        );

        renderWithQueryClient(<ServerCapacityCard serverId="test" />);

        const skeleton = screen.getByLabelText(/Loading server capacity/i);
        expect(skeleton).toBeInTheDocument();
        expect(skeleton).toHaveAttribute("aria-busy", "true");
    });

    it("shows a 'Server is connecting' message on a 404 response", async () => {
        vi.mocked(api.getCapacityAdvisory).mockRejectedValue(
            new ApiRequestError(404, { message: "no metrics" })
        );

        renderWithQueryClient(<ServerCapacityCard serverId="test" />);

        await waitFor(() => {
            expect(screen.getByText(/Server is connecting/i)).toBeInTheDocument();
        });
        expect(
            screen.getByText(/capacity will appear once metrics arrive/i)
        ).toBeInTheDocument();
    });

    it("shows a generic error message on non-404 failures", async () => {
        vi.mocked(api.getCapacityAdvisory).mockRejectedValue(
            new Error("network down")
        );

        renderWithQueryClient(<ServerCapacityCard serverId="test" />);

        await waitFor(() => {
            expect(
                screen.getByText(/Could not load capacity advisory/i)
            ).toBeInTheDocument();
        });
    });
});
