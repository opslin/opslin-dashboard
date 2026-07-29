import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { APP_SECTIONS, AppSectionNav } from "../AppSectionNav";

describe("AppSectionNav", () => {
    it("renders all seven app sections", () => {
        render(<AppSectionNav value="overview" onValueChange={vi.fn()} />);

        for (const section of APP_SECTIONS) {
            expect(screen.getByRole("tab", { name: section.label })).toBeVisible();
        }
    });

    it("highlights the selected section and emits section changes", () => {
        const onValueChange = vi.fn();
        render(<AppSectionNav value="logs" onValueChange={onValueChange} />);

        expect(screen.getByRole("tab", { name: "Logs" })).toHaveAttribute("aria-selected", "true");
        fireEvent.mouseDown(screen.getByRole("tab", { name: "Metrics" }), { button: 0 });
        expect(onValueChange).toHaveBeenCalledWith("metrics");
    });
});
