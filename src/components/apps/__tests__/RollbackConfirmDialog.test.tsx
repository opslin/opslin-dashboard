import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RollbackConfirmDialog } from "../RollbackConfirmDialog";

describe("RollbackConfirmDialog", () => {
    it("requires explicit confirmation with the target version and route warning", () => {
        const onConfirm = vi.fn();

        render(
            <RollbackConfirmDialog
                open
                targetSha="abc1234"
                onOpenChange={vi.fn()}
                onConfirm={onConfirm}
            />
        );

        expect(screen.getByText("Roll back to version abc1234?")).toBeVisible();
        expect(screen.getByText("This will deploy the previous version and re-apply domain routes.")).toBeVisible();
        expect(screen.getByRole("button", { name: "Cancel" })).toBeVisible();

        fireEvent.click(screen.getByRole("button", { name: "Confirm Rollback" }));

        expect(onConfirm).toHaveBeenCalledTimes(1);
    });
});
