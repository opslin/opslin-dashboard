import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AddressSettingsRow } from "../AddressSettingsRow";

describe("AddressSettingsRow", () => {
    it("shows nothing when no setting points to localhost", () => {
        const { container } = render(<AddressSettingsRow keys={[]} applied={false} onApply={() => {}} />);
        expect(container).toBeEmptyDOMElement();
    });

    it("names the settings and offers one action", () => {
        const onApply = vi.fn();
        render(<AddressSettingsRow keys={["FRONTEND_URL"]} applied={false} onApply={onApply} />);
        expect(screen.getByText("FRONTEND_URL points to localhost")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /use my app's address/i }));
        expect(onApply).toHaveBeenCalledTimes(1);
    });

    it("summarises long lists and uses plural wording", () => {
        render(<AddressSettingsRow keys={["A_URL", "B_URL", "C_URL", "D_URL"]} applied={false} onApply={() => {}} />);
        expect(screen.getByText("A_URL, B_URL and 2 more point to localhost")).toBeInTheDocument();
    });

    it("confirms once applied and drops the action", () => {
        render(<AddressSettingsRow keys={["FRONTEND_URL"]} applied onApply={() => {}} />);
        expect(screen.getByText("FRONTEND_URL will use your app's address")).toBeInTheDocument();
        expect(screen.queryByRole("button")).toBeNull();
    });
});
