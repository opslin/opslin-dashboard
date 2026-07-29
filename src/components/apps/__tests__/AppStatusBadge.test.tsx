import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppStatusBadge } from "../AppStatusBadge";

describe("AppStatusBadge", () => {
    it("displays deleting status for app list cards", () => {
        render(<AppStatusBadge status="deleting" />);

        expect(screen.getByText("Deleting")).toBeVisible();
    });

    it("displays delete_failed status for app list cards", () => {
        render(<AppStatusBadge status="delete_failed" />);

        expect(screen.getByText("Delete Failed")).toBeVisible();
    });
});
