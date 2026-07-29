import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DnsInstructionCard } from "../DnsInstructionCard";
import type { DnsInstruction } from "@/lib/api";

function instruction(overrides: Partial<DnsInstruction> = {}): DnsInstruction {
    return {
        type: "A",
        name: "@",
        value: "13.201.10.20",
        ttl: "Auto",
        ...overrides,
    };
}

describe("DnsInstructionCard", () => {
    it('renders "@" as the name for apex domains', () => {
        render(<DnsInstructionCard domain="myclient.com" instruction={instruction({ name: "@" })} />);

        expect(screen.getByText("@")).toBeVisible();
    });

    it('renders "app" as the name for subdomains', () => {
        render(<DnsInstructionCard domain="app.myclient.com" instruction={instruction({ name: "app" })} />);

        expect(screen.getByText("app")).toBeVisible();
    });

    it("displays the IP value", () => {
        render(<DnsInstructionCard domain="myclient.com" instruction={instruction({ value: "13.201.44.55" })} />);

        expect(screen.getByText("13.201.44.55")).toBeVisible();
    });
});
