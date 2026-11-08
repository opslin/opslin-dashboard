import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const useMarketplace = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-marketplace", () => ({ useMarketplace, useMarketplaceEnabled: () => true }));

import MarketplacePage from "@/app/(dashboard)/marketplace/page";

describe("Marketplace is coming soon", () => {
    it("says so, offers nothing to deploy, and never asks for the catalog", () => {
        render(<MarketplacePage />);
        expect(screen.getByRole("heading", { level: 1, name: "Marketplace" })).toBeInTheDocument();
        expect(screen.getByText("Coming soon")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /Deploy/ })).not.toBeInTheDocument();
        expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
        expect(useMarketplace).not.toHaveBeenCalled();
    });
});
