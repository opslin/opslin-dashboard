import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DeployProgressIndicator } from "../deploy-progress-indicator";

describe("DeployProgressIndicator", () => {
    it("renders queued phase as waiting state, not failure", () => {
        render(
            <DeployProgressIndicator
                phase="queued"
                line="Queued on server — another deployment is currently building on this server."
                percent={20}
                status="running"
            />
        );

        const badge = screen.getByText(/Queued on Server/i).closest("[data-slot='badge']");
        expect(badge).toBeInTheDocument();
        expect(badge).toHaveClass("bg-warning-muted");
        expect(screen.getByText(/will continue automatically/i)).toBeInTheDocument();
        expect(screen.queryByText(/failed/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/Deployment failed/i)).not.toBeInTheDocument();
    });
});
