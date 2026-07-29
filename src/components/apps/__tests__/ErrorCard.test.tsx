import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorCard } from "../error-card";

describe("ErrorCard", () => {
    it("shows the friendly deploy failure before collapsed raw details", () => {
        render(
            <ErrorCard
                classification={{
                    category: "DOCKER_FAILED",
                    title: "Docker operation failed",
                    summary: "Docker could not build, pull, or start the app image on the server.",
                    suggestion: "Verify Docker is running and the Dockerfile/build settings are valid.",
                    logSnippet: "docker buildx build failed: failed to solve",
                    docsLink: "/docs/deployments/troubleshooting#docker-failed",
                }}
                rawError="raw docker error"
                onRetry={vi.fn()}
            />
        );

        expect(screen.getByText("Docker operation failed")).toBeVisible();
        expect(screen.getByText("Root cause: Docker operation failed")).toBeVisible();
        expect(screen.getByText(/Docker could not build/i)).toBeVisible();
        expect(screen.getByText(/Verify Docker is running/i)).toBeVisible();
        expect(screen.getByRole("link", { name: /see docs/i })).toHaveAttribute(
            "href",
            "/docs/deployments/troubleshooting#docker-failed",
        );
        expect(screen.getByRole("button", { name: /retry deploy/i })).toBeVisible();

        const details = screen.getByText("Error snippet").closest("details");
        expect(details).not.toHaveAttribute("open");
        expect(screen.getAllByText(/docker buildx build failed/i)).toHaveLength(2);
    });

    it("prefers canonical fields and copies masked diagnostics", () => {
        const writeText = vi.fn();
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: { writeText },
        });

        render(
            <ErrorCard
                classification={{
                    code: "HEALTH_CONTAINER_EXITED",
                    category: "LEGACY_HEALTH",
                    title: "Container crashed before health check",
                    description: "The candidate container exited before Opslin could probe it.",
                    summary: "Legacy summary should not render.",
                    suggestedFix: "Fix the start command and redeploy.",
                    suggestion: "Legacy suggestion should not render.",
                    logSnippet: "TOKEN=supersecret\nexitCode=137\nlistening failed",
                    docsLink: "/docs/deployments/troubleshooting#container-exited",
                    diagnostics: {
                        healthPath: "/ready",
                        candidateExitCode: 137,
                        buildpack: "node",
                        runtime: "nodejs",
                        lastLogLines: [
                            "booting",
                            "DATABASE_URL=postgresql://user:pass@example/db",
                            "API_KEY=plain-secret",
                            "exit code 137",
                        ],
                    },
                }}
            />
        );

        expect(screen.getByText("HEALTH_CONTAINER_EXITED")).toBeVisible();
        expect(screen.queryByText("LEGACY_HEALTH")).not.toBeInTheDocument();
        expect(screen.getByText("The candidate container exited before Opslin could probe it.")).toBeVisible();
        expect(screen.queryByText("Legacy summary should not render.")).not.toBeInTheDocument();
        expect(screen.getByText(/Fix the start command and redeploy/i)).toBeVisible();
        expect(screen.queryByText("Legacy suggestion should not render.")).not.toBeInTheDocument();

        const diagnostics = screen.getByText("Diagnostics").closest("details");
        expect(diagnostics).not.toHaveAttribute("open");
        expect(screen.getByText(/Health path: \/ready/i)).toBeInTheDocument();
        expect(screen.getByText(/Candidate exit code: 137/i)).toBeInTheDocument();
        expect(screen.getByText(/Buildpack: node/i)).toBeInTheDocument();
        expect(screen.getByText(/Runtime: nodejs/i)).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /copy diagnostics/i }));
        expect(writeText).toHaveBeenCalledTimes(1);
        const copied = writeText.mock.calls[0][0] as string;
        expect(copied).toContain("Classifier: HEALTH_CONTAINER_EXITED");
        expect(copied).toContain("Health path: /ready");
        expect(copied).toContain("Candidate exit code: 137");
        expect(copied).toContain("Buildpack: node");
        expect(copied).toContain("Runtime: nodejs");
        expect(copied).toContain("DATABASE_URL=[redacted]");
        expect(copied).toContain("API_KEY=[redacted]");
        expect(copied).not.toContain("supersecret");
        expect(copied).not.toContain("plain-secret");
    });

    it("falls back to the troubleshooting docs when classification docsLink is missing", () => {
        render(
            <ErrorCard
                classification={{
                    category: "UNKNOWN",
                    title: "Deployment failed",
                    summary: "Opslin could not classify this deploy failure.",
                    suggestion: "Check the logs and retry.",
                    logSnippet: "",
                }}
            />
        );

        expect(screen.getByRole("link", { name: /see docs/i })).toHaveAttribute(
            "href",
            "/docs/deployments/troubleshooting#unknown",
        );
    });
});
