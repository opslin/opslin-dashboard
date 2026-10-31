import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DeployAssurance } from "../DeployAssurance";

describe("DeployAssurance (doc 64 S3.6)", () => {
    it("says verified only when every check passed", () => {
        render(<DeployAssurance assurance={{ level: "application_verified", limits: [] }} />);
        expect(screen.getByText("Verified")).toBeTruthy();
        expect(screen.getByText("Uses its databases, every check passed")).toBeTruthy();
        expect(screen.queryByText("Not proven")).toBeNull();
    });

    it("lists what could not be proven behind a collapsed row", () => {
        const { container } = render(<DeployAssurance assurance={{ level: "technical_release", limits: ["No client was connected to Redis during the check.", "The website calls its backend from the visitor's browser."] }} />);
        expect(screen.getByText("Running")).toBeTruthy();
        expect(screen.getByText("2 things not proven")).toBeTruthy();
        expect(container.querySelector("details")?.hasAttribute("open")).toBe(false);
        expect(screen.getByText("No client was connected to Redis during the check.")).toBeTruthy();
    });

    it("shows nothing for an older result without an assurance level", () => {
        const { container } = render(<DeployAssurance assurance={undefined} />);
        expect(container.innerHTML).toBe("");
    });
});
