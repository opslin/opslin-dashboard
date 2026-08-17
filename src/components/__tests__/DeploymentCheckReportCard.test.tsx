import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DeploymentCheckReportCard } from "../DeploymentCheckReportCard";
import type { DeploymentCheckReport } from "@/lib/api";

function report(overrides: Partial<DeploymentCheckReport> = {}): DeploymentCheckReport {
    return {
        id: "report-1",
        deploymentId: "deployment-1",
        appId: "app-1",
        serverId: "server-1",
        organizationId: "org-1",
        mode: "health_only",
        status: "passed",
        healthPassed: true,
        healthPath: "/",
        healthStatusCode: 200,
        healthResponseMs: 248,
        smokePassed: false,
        smokeStatus: "not_applicable",
        smokeStatusCode: null,
        smokeResponseMs: null,
        virtualUsers: 0,
        durationSeconds: 0,
        totalRequests: 1,
        successRequests: 1,
        failedRequests: 0,
        p50Ms: 248,
        p95Ms: 347,
        errorRate: 0,
        containerRestarted: false,
        autoRolledBack: false,
        vuAborted: false,
        createdAt: "2026-08-17T00:00:00.000Z",
        ...overrides,
    };
}

describe("DeploymentCheckReportCard", () => {
    it("shows the overall Passed banner when smoke never ran, instead of being stuck at Warning", () => {
        render(<DeploymentCheckReportCard report={report()} />);

        expect(screen.getByText("Passed")).toBeInTheDocument();
    });

    it("renders Smoke Test as a neutral 'Not run' row, not a failure, when smokeStatus is not_applicable", () => {
        const { container } = render(<DeploymentCheckReportCard report={report()} />);

        expect(screen.getByText("Not run")).toBeInTheDocument();
        const icon = container.querySelector("#deployment-check-report-smoke-test svg");
        expect(icon?.getAttribute("class")).toContain("text-muted-foreground");
        expect(icon?.getAttribute("class")).not.toContain("text-danger-text");
    });

    it("renders Smoke Test as a real failure when smokeStatus is failed, and drops the banner to Warning", () => {
        const { container } = render(
            <DeploymentCheckReportCard report={report({ smokeStatus: "failed", smokeStatusCode: 500 })} />
        );

        const icon = container.querySelector("#deployment-check-report-smoke-test svg");
        expect(icon?.getAttribute("class")).toContain("text-danger-text");
        expect(screen.getByText("Warning")).toBeInTheDocument();
    });

    it("renders Smoke Test as passed when smokeStatus is passed", () => {
        const { container } = render(
            <DeploymentCheckReportCard report={report({ smokeStatus: "passed", smokeStatusCode: 200 })} />
        );

        const icon = container.querySelector("#deployment-check-report-smoke-test svg");
        expect(icon?.getAttribute("class")).toContain("text-success-text");
    });

    it("renders Virtual Users as 'Not run' when the deploy only ran a health check, not hardcoded green with 0x0", () => {
        const { container } = render(<DeploymentCheckReportCard report={report()} />);

        expect(screen.getByText("Not run (health check only)")).toBeInTheDocument();
        const icon = container.querySelector("#deployment-check-report-virtual-users svg");
        expect(icon?.getAttribute("class")).toContain("text-muted-foreground");
    });

    it("renders Virtual Users as a failure when a VU run actually executed and was aborted", () => {
        const { container } = render(
            <DeploymentCheckReportCard
                report={report({ mode: "virtual_user", virtualUsers: 10, durationSeconds: 30, vuAborted: true })}
            />
        );

        const icon = container.querySelector("#deployment-check-report-virtual-users svg");
        expect(icon?.getAttribute("class")).toContain("text-danger-text");
    });

    it("renders Virtual Users as passed when a VU run executed and was not aborted", () => {
        const { container } = render(
            <DeploymentCheckReportCard
                report={report({ mode: "virtual_user", virtualUsers: 10, durationSeconds: 30, vuAborted: false })}
            />
        );

        const icon = container.querySelector("#deployment-check-report-virtual-users svg");
        expect(icon?.getAttribute("class")).toContain("text-success-text");
    });

    it("renders nothing when report is null", () => {
        const { container } = render(<DeploymentCheckReportCard report={null} />);

        expect(container).toBeEmptyDOMElement();
    });
});
