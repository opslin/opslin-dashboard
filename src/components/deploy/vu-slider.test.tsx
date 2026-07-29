import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VuSlider } from "./vu-slider";

/**
 * Unit tests for VuSlider.
 *
 * Validates: Requirements 3.1, 2.1
 *
 * Note: The danger-zone confirmation gate (modal with "I understand, proceed
 * anyway" / "Cancel") is part of Task 11.2's `VuSliderWithDangerZone` wrapper
 * which has not been implemented yet. These tests cover only the underlying
 * VuSlider visual states and clamping behaviour.
 */
describe("VuSlider", () => {
    const baseProps = {
        planMaxVu: 10,
        safeVuCeiling: 5,
        recommendedVu: 5,
        serverProfile: { cpuCores: 4, totalMemMb: 8192 },
        value: 0,
        onChange: vi.fn(),
    };

    it("renders the slider with the plan-bounded range", () => {
        render(<VuSlider {...baseProps} />);

        const slider = screen.getByRole("slider", { name: /Virtual users/i });
        expect(slider).toHaveAttribute("aria-valuemax", "10");
        expect(slider).toHaveAttribute("max", "10");
        expect(slider).toHaveAttribute("min", "0");
    });

    it("displays server capacity info (cores and RAM)", () => {
        render(<VuSlider {...baseProps} />);

        // The server profile appears as "4 cores, 8 GB RAM" in a single string.
        expect(screen.getByText(/4 cores/i)).toBeInTheDocument();
        expect(screen.getByText(/8 GB RAM/i)).toBeInTheDocument();
    });

    it("displays the safe VU ceiling", () => {
        render(<VuSlider {...baseProps} safeVuCeiling={5} />);

        // "5 VUs" appears in the safe-ceiling row; recommendedVu is also 5 here
        // so we use getAllByText to tolerate multiple matches.
        const matches = screen.getAllByText(/5 VUs/);
        expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    it("displays the plan max", () => {
        render(<VuSlider {...baseProps} planMaxVu={10} />);

        expect(screen.getByText(/10 VUs/)).toBeInTheDocument();
    });

    it("displays the recommended VU", () => {
        render(<VuSlider {...baseProps} recommendedVu={5} />);

        // Recommended row uses "5 VUs". safeVuCeiling is also 5 so multiple
        // matches are expected.
        const matches = screen.getAllByText(/5 VUs/);
        expect(matches.length).toBeGreaterThanOrEqual(1);

        // Verify the "Recommended" label exists. It appears both in the
        // advisory panel header and again in the helper text below the
        // slider, so we use getAllByText.
        const recommendedLabels = screen.getAllByText(/Recommended/i);
        expect(recommendedLabels.length).toBeGreaterThanOrEqual(1);
    });

    it("calls onChange with the slider value when the user drags", () => {
        const onChange = vi.fn();
        render(<VuSlider {...baseProps} onChange={onChange} />);

        const slider = screen.getByRole("slider", { name: /Virtual users/i });
        fireEvent.change(slider, { target: { value: "8" } });

        expect(onChange).toHaveBeenCalledWith(8);
    });

    it("clamps values above planMaxVu down to planMaxVu", () => {
        const onChange = vi.fn();
        render(<VuSlider {...baseProps} planMaxVu={10} onChange={onChange} />);

        const slider = screen.getByRole("slider", { name: /Virtual users/i });
        // Native range inputs already constrain via max="10", but VuSlider
        // also clamps explicitly in its onChange handler. Either way the
        // resulting onChange callback must receive the clamped value.
        fireEvent.change(slider, { target: { value: "20" } });

        expect(onChange).toHaveBeenCalledWith(10);
    });

    it("shows the disabled empty state when safeVuCeiling === 0", () => {
        render(<VuSlider {...baseProps} safeVuCeiling={0} recommendedVu={0} />);

        expect(screen.getByText(/VU testing not available/i)).toBeInTheDocument();

        // The interactive slider input should not be rendered in the
        // unavailable state — only an aria-hidden visual placeholder remains.
        expect(
            screen.queryByRole("slider", { name: /Virtual users/i })
        ).not.toBeInTheDocument();
    });

    it("renders the acknowledged danger-zone visual state", () => {
        render(
            <VuSlider
                {...baseProps}
                value={8}
                safeVuCeiling={5}
                dangerZoneAcknowledged={true}
            />
        );

        expect(
            screen.getByText(/Danger zone acknowledged/i)
        ).toBeInTheDocument();
    });

    it("renders the un-acknowledged danger-zone visual state", () => {
        render(
            <VuSlider
                {...baseProps}
                value={8}
                safeVuCeiling={5}
                dangerZoneAcknowledged={false}
            />
        );

        // The helper text in the un-acknowledged danger zone mentions both
        // "Above the safe ceiling" and "Confirmation will be required".
        // Either substring is acceptable per the task spec.
        const helperText = screen.getByText(
            /Above the safe ceiling|Confirmation will be required/i
        );
        expect(helperText).toBeInTheDocument();
    });
});
