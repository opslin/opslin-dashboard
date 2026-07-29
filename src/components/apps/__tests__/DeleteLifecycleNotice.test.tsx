import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DeleteLifecycleNotice } from "../DeleteLifecycleNotice";

describe("DeleteLifecycleNotice", () => {
    it("shows truthful deleting state without false success", () => {
        render(<DeleteLifecycleNotice status="deleting" />);

        expect(screen.getByText("Deleting app")).toBeVisible();
        expect(screen.getByText(/Cleanup is running on the server/i)).toBeVisible();
        expect(screen.getByText(/disappear after cleanup succeeds/i)).toBeVisible();
    });

    it("shows delete_failed state and retries cleanup once", () => {
        const onRetry = vi.fn();

        render(
            <DeleteLifecycleNotice
                status="delete_failed"
                errorReason="Cloudflare preview DNS cleanup failed"
                onRetry={onRetry}
            />
        );

        expect(screen.getByText("Delete cleanup failed")).toBeVisible();
        expect(screen.getByText(/app record is kept/i)).toBeVisible();
        expect(screen.getByText("Cloudflare preview DNS cleanup failed")).toBeVisible();

        fireEvent.click(screen.getByRole("button", { name: /Retry cleanup/i }));
        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it("blocks duplicate retry clicks while pending", () => {
        render(<DeleteLifecycleNotice status="delete_failed" onRetry={vi.fn()} retryPending />);

        expect(screen.getByRole("button", { name: /Retry cleanup/i })).toBeDisabled();
    });
});
