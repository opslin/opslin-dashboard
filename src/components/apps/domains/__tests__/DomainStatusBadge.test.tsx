import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DomainStatusBadge } from "../DomainStatusBadge";
import type { AppDomainStatus } from "@/lib/api";

const statusLabels: Record<AppDomainStatus, string> = {
    pending_dns: "Waiting for DNS",
    misconfigured: "Needs DNS fix",
    connected: "DNS Connected",
    ssl_pending: "SSL Pending",
    active: "Active HTTPS",
    failed: "Failed",
    disabled: "Disabled",
};

describe("DomainStatusBadge", () => {
    it("renders Waiting for DNS for pending_dns", () => {
        render(<DomainStatusBadge status="pending_dns" />);

        expect(screen.getByText("Waiting for DNS")).toBeVisible();
    });

    it("renders Active HTTPS with the green active styling", () => {
        render(<DomainStatusBadge status="active" />);

        const label = screen.getByText("Active HTTPS");
        expect(label).toBeVisible();
        expect(label.closest('[data-slot="badge"]')).toHaveClass("bg-success-muted");
    });

    it("renders the correct label for all statuses", () => {
        for (const [status, label] of Object.entries(statusLabels) as Array<[AppDomainStatus, string]>) {
            const { unmount } = render(<DomainStatusBadge status={status} />);
            expect(screen.getByText(label)).toBeVisible();
            unmount();
        }
    });
});
