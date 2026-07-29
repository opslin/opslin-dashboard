import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DeleteAppAction } from "../DeleteAppAction";

describe("DeleteAppAction", () => {
    it("opens typed confirmation and blocks submit until the exact app name is entered", () => {
        const onConfirm = vi.fn();

        render(<DeleteAppAction appName="Checkout API" onConfirm={onConfirm} />);

        fireEvent.click(screen.getByRole("button", { name: "Delete App" }));

        expect(screen.getByText("Delete app?")).toBeVisible();
        expect(screen.getByText("Checkout API")).toBeVisible();
        expect(screen.getByText(/Type the app name to confirm/i)).toBeVisible();

        const confirmButton = screen.getAllByRole("button", { name: "Delete App" }).at(-1);
        expect(confirmButton).toBeDisabled();

        fireEvent.change(screen.getByLabelText(/Type the app name to confirm/i), {
            target: { value: "checkout api" },
        });
        expect(confirmButton).toBeDisabled();

        fireEvent.change(screen.getByLabelText(/Type the app name to confirm/i), {
            target: { value: "Checkout API" },
        });
        expect(confirmButton).toBeEnabled();

        fireEvent.click(confirmButton!);
        expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it("blocks duplicate delete clicks while pending", () => {
        render(<DeleteAppAction appName="Checkout API" onConfirm={vi.fn()} pending />);

        expect(screen.getByRole("button", { name: /Delete App/i })).toBeDisabled();
    });
});
