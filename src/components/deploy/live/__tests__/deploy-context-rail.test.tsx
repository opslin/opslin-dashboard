import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DeployContextRail } from "../deploy-context-rail";

describe("DeployContextRail", () => {
    it("renders nothing when no real fields are available (never fabricates a placeholder)", () => {
        const { container } = render(<DeployContextRail />);
        expect(container).toBeEmptyDOMElement();
    });

    it("renders only the fields with real data — omits rollback target when there's no previousSha", () => {
        render(<DeployContextRail serverName="prod-1" serverConnected />);
        expect(screen.getByText("prod-1")).toBeInTheDocument();
        expect(screen.queryByText("Rollback target")).not.toBeInTheDocument();
        expect(screen.queryByText("Health")).not.toBeInTheDocument();
    });

    it("flags a disconnected server distinctly", () => {
        render(<DeployContextRail serverName="prod-1" serverConnected={false} />);
        expect(screen.getByText(/disconnected/i)).toBeInTheDocument();
    });

    it("shows health as probing (not failed) before healthPassed becomes true", () => {
        render(<DeployContextRail healthPassed={false} />);
        expect(screen.getByText("Probing")).toBeInTheDocument();
    });

    it("shows health as passed once real data confirms it", () => {
        render(<DeployContextRail healthPassed />);
        expect(screen.getByText("Passed")).toBeInTheDocument();
    });

    it("shows a shortened rollback target sha when previousSha is real", () => {
        render(<DeployContextRail previousSha="abcdef1234567890" />);
        expect(screen.getByText("abcdef1")).toBeInTheDocument();
    });
});
