import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StackInputs, stackInputsComplete, looksSecret } from "../StackInputs";

const needs = [{ name: "SMTP_HOST", why: "The project's code requires it: mail is the only way to reset a password." }];
const willDo = ["Creates the PostgreSQL database it expects and sets DATABASE_URL.", "Runs pnpm run db:migrate --yes before the services start."];

describe("StackInputs", () => {
    it("asks for each required setting, with the project's own reason, before Deploy", () => {
        render(<StackInputs needs={needs} willDo={willDo} values={{}} onChange={vi.fn()} />);
        expect(screen.getByText("Needs your input")).toBeTruthy();
        expect(screen.getByText("SMTP_HOST")).toBeTruthy();
        expect(screen.getByText(/mail is the only way to reset a password/)).toBeTruthy();
        expect(screen.getByLabelText("SMTP_HOST")).toBeTruthy();
    });

    it("reports what the person types, under the setting's name", () => {
        const onChange = vi.fn();
        render(<StackInputs needs={needs} willDo={willDo} values={{}} onChange={onChange} />);
        fireEvent.change(screen.getByLabelText("SMTP_HOST"), { target: { value: "smtp.mailer.test" } });
        expect(onChange).toHaveBeenCalledWith("SMTP_HOST", "smtp.mailer.test");
    });

    it("says what Opslin sets up by itself", () => {
        render(<StackInputs needs={needs} willDo={willDo} values={{}} onChange={vi.fn()} />);
        expect(screen.getByText("What Opslin sets up for you")).toBeTruthy();
        expect(screen.getByText(/Creates the PostgreSQL database/)).toBeTruthy();
    });

    it("shows nothing when there is nothing to say", () => {
        const { container } = render(<StackInputs needs={[]} willDo={[]} values={{}} onChange={vi.fn()} />);
        expect(container.firstChild).toBeNull();
    });

    it("is complete only when every required setting has a value", () => {
        expect(stackInputsComplete(needs, {})).toBe(false);
        expect(stackInputsComplete(needs, { SMTP_HOST: "   " })).toBe(false);
        expect(stackInputsComplete(needs, { SMTP_HOST: "smtp.mailer.test" })).toBe(true);
        expect(stackInputsComplete([], {})).toBe(true);
        expect(stackInputsComplete(undefined, {})).toBe(true);
    });
});

describe("secret-looking settings are hidden while typing", () => {
    it("recognises secrets by name", () => {
        for (const name of ["RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET", "SMTP_PASS", "SMTP_PASSWORD", "AUTH_TOKEN", "GOOGLE_MAPS_API_KEY", "SIGNING_PRIVATE_KEY"]) expect(looksSecret(name)).toBe(true);
        for (const name of ["SMTP_HOST", "RAZORPAY_KEY_ID", "EMAIL_FROM", "CORS_ORIGINS"]) expect(looksSecret(name)).toBe(false);
    });
    it("uses a password field for them and a text field for the rest", () => {
        render(<StackInputs needs={[{ name: "RAZORPAY_KEY_SECRET", why: "x" }, { name: "SMTP_HOST", why: "y" }]} willDo={[]} values={{}} onChange={vi.fn()} />);
        expect((screen.getByLabelText("RAZORPAY_KEY_SECRET") as HTMLInputElement).type).toBe("password");
        expect((screen.getByLabelText("SMTP_HOST") as HTMLInputElement).type).toBe("text");
    });
});
