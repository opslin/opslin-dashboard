import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DeployQuestions, InvestigationSteps, generatePassword } from "../DeployInvestigation";
import type { DilRunQuestion, DilRunStep } from "@/lib/api";

const questions: DilRunQuestion[] = [
    { id: "LICENSE_KEY", kind: "secret", title: "LICENSE_KEY (a licence)", body: "What it is for: unlocks the product\nWhere to get it: the vendor's portal" },
    { id: "which-app", kind: "decision", title: "Which app is the public site?", body: "Why Opslin asks: two apps start a server", options: ["apps/web", "apps/admin"] },
];

describe("DeployQuestions (API doc 80)", () => {
    it("sends settings and decisions separately, only once every question is answered", () => {
        const onSubmit = vi.fn();
        render(<DeployQuestions questions={questions} submitting={false} onSubmit={onSubmit} />);
        const send = screen.getByRole("button", { name: "Continue the deploy" });
        expect(send).toBeDisabled();
        const input = screen.getByLabelText("LICENSE_KEY (a licence)");
        expect(input).toHaveAttribute("type", "password");
        fireEvent.change(input, { target: { value: "  LIC-123  " } });
        expect(send).toBeDisabled();
        fireEvent.click(screen.getByRole("radio", { name: "apps/web" }));
        expect(send).toBeEnabled();
        fireEvent.click(send);
        expect(onSubmit).toHaveBeenCalledWith({ settings: { LICENSE_KEY: "LIC-123" }, decisions: { "which-app": "apps/web" } });
    });

    it("shows what each value is for, and the server's refusal when there is one", () => {
        render(<DeployQuestions questions={questions} submitting error="LICENSE_KEY is still missing." onSubmit={() => undefined} />);
        expect(screen.getByText("Where to get it")).toBeInTheDocument();
        expect(screen.getByText("the vendor's portal")).toBeInTheDocument();
        expect(screen.getByRole("alert")).toHaveTextContent("LICENSE_KEY is still missing.");
        expect(screen.getByRole("button", { name: "Continuing…" })).toBeDisabled();
    });
});

describe("password questions (API doc 80)", () => {
    const admin: DilRunQuestion[] = [
        { id: "FIRST_SUPERUSER", kind: "secret", title: "FIRST_SUPERUSER", body: "What it is for: the admin e-mail address" },
        { id: "FIRST_SUPERUSER_PASSWORD", kind: "secret", title: "FIRST_SUPERUSER_PASSWORD", body: "What it is for: the admin password" },
    ];
    it("offers to generate a password, and shows it before the deploy goes on", () => {
        const onSubmit = vi.fn();
        render(<DeployQuestions questions={admin} submitting={false} onSubmit={onSubmit} />);
        expect(screen.getAllByRole("button", { name: "Generate a password" })).toHaveLength(1); // only the password field
        const password = screen.getByLabelText("FIRST_SUPERUSER_PASSWORD") as HTMLInputElement;
        expect(password).toHaveAttribute("type", "password");
        fireEvent.click(screen.getByRole("button", { name: "Generate a password" }));
        expect(password).toHaveAttribute("type", "text");
        expect(password.value).toMatch(/^[A-HJ-NP-Za-km-z2-9]{20}$/);
        expect(screen.getByText(/Write it down now/)).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText("FIRST_SUPERUSER"), { target: { value: "me@example.com" } });
        fireEvent.click(screen.getByRole("button", { name: "Continue the deploy" }));
        expect(onSubmit).toHaveBeenCalledWith({ settings: { FIRST_SUPERUSER: "me@example.com", FIRST_SUPERUSER_PASSWORD: password.value }, decisions: {} });
    });
    it("generates different strong passwords from the secure generator", () => {
        const a = generatePassword(), b = generatePassword();
        expect(a).toHaveLength(20);
        expect(a).not.toBe(b);
    });
    it("lets the owner cancel the paused deploy", () => {
        const onCancel = vi.fn();
        render(<DeployQuestions questions={admin} submitting={false} onSubmit={() => undefined} onCancel={onCancel} />);
        fireEvent.click(screen.getByRole("button", { name: "Cancel this deploy" }));
        expect(onCancel).toHaveBeenCalled();
    });
});

describe("InvestigationSteps (API doc 80)", () => {
    const steps: DilRunStep[] = [
        { kind: "agent_step", at: "", note: "Reading the entry file.", action: "repo_read server.js" },
        { kind: "agent_step", at: "", note: "Tried something the rules refuse.", action: "revise_plan", refused: "no evidence" },
        { kind: "agent_plan", at: "", reason: "The secret is the app's own.", changes: ["SESSION_SECRET: generate"] },
        { kind: "agent_exec", at: "", started: true },
        { kind: "agent_exec", at: "", finished: true, verified: true },
        { kind: "agent_outcome", at: "", outcome: "stopped", explanation: "The build fails on a type error in src/a.ts line 12.", nextStep: "Fix the type error and deploy again." },
    ];
    it("lists what was found, changed and verified, without the refused attempts", () => {
        render(<InvestigationSteps steps={steps} defaultOpen />);
        expect(screen.getByText("What Opslin did (4 steps)")).toBeInTheDocument();
        expect(screen.getByText("Reading the entry file.")).toBeInTheDocument();
        expect(screen.queryByText("Tried something the rules refuse.")).not.toBeInTheDocument();
        expect(screen.getByText("SESSION_SECRET: generate")).toBeInTheDocument();
        expect(screen.getByText("Deployed and checked: it works")).toBeInTheDocument();
        expect(screen.getByText("Next step: Fix the type error and deploy again.")).toBeInTheDocument();
    });
    it("is closed until opened, and shows nothing when there are no steps", () => {
        const { container, rerender } = render(<InvestigationSteps steps={steps} />);
        expect(screen.queryByText("Reading the entry file.")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /What Opslin did/ }));
        expect(screen.getByText("Reading the entry file.")).toBeInTheDocument();
        rerender(<InvestigationSteps steps={[]} />);
        expect(container).toBeEmptyDOMElement();
    });
});
