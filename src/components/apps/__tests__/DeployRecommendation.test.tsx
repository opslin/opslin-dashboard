import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DeployRecommendation, recommendedWay } from "../DeployRecommendation";
import type { DeployRecommendationData, FitAssessmentData } from "@/lib/deploy-route-types";

const data = (over: Partial<DeployRecommendationData> = {}): DeployRecommendationData => ({
    route: "compose", confidence: "high", reasons: ["The repository has a compose file.", "It needs: postgres."], isMonorepo: false, units: [], needs: ["postgres"], composeServices: [], safeMigrationAvailable: false, resolvedSha: null, ...over,
});

describe("DeployRecommendation", () => {
    it("maps each route to the way the wizard deploys", () => {
        expect(recommendedWay("simple")).toBe("standard");
        expect(recommendedWay("compose")).toBe("standard");
        expect(recommendedWay("ai")).toBe("ai");
    });

    it("shows the recommended way, its confidence, and the reasons behind a Why row", () => {
        render(<DeployRecommendation state={{ status: "ready", data: data() }} chosen="standard" onChoose={vi.fn()} />);
        expect(screen.getByText("Best way: Standard deploy of the compose project")).toBeTruthy();
        expect(screen.getByText("Confident")).toBeTruthy();
        expect(screen.getByText("Why")).toBeTruthy();
        expect(screen.getByText("It needs: postgres.")).toBeTruthy();
        // already on the recommended way: no switch button
        expect(screen.queryByRole("button")).toBeNull();
    });

    it("offers one action when the chosen way differs, and reports the choice", () => {
        const onChoose = vi.fn();
        render(<DeployRecommendation state={{ status: "ready", data: data({ route: "simple" }) }} chosen="ai" onChoose={onChoose} />);
        fireEvent.click(screen.getByRole("button", { name: "Use standard deploy" }));
        expect(onChoose).toHaveBeenCalledWith("standard");
    });

    it("offers AI-assisted deploy when that is the advice, and can be disabled while deploying", () => {
        const onChoose = vi.fn();
        render(<DeployRecommendation state={{ status: "ready", data: data({ route: "ai", confidence: "low" }) }} chosen="standard" onChoose={onChoose} disabled />);
        expect(screen.getByText("Not sure, check it")).toBeTruthy();
        const button = screen.getByRole("button", { name: "Use AI-assisted deploy" }) as HTMLButtonElement;
        expect(button.disabled).toBe(true);
    });

    it("has a skeleton while checking and a quiet line when the repository can't be read", () => {
        const { rerender } = render(<DeployRecommendation state={{ status: "loading" }} chosen="ai" onChoose={vi.fn()} />);
        expect(screen.getByLabelText("Checking the best way to deploy")).toBeTruthy();
        rerender(<DeployRecommendation state={{ status: "error" }} chosen="ai" onChoose={vi.fn()} />);
        expect(screen.getByText(/Couldn't check this repository/)).toBeTruthy();
    });

    const fit = (over: Partial<FitAssessmentData> = {}): FitAssessmentData => ({
        level: "too_small", required: { ramMb: 2200, diskMb: 7800 }, available: { ramMb: 2046, diskMb: 15800 },
        headline: "Too small for this server", recommendation: "Upgrade memory to at least 2750 MB",
        reasons: ["It needs about 2.1 GB of free memory; this server has 2.0 GB free."], history: null, ...over,
    });

    it("shows the server fit under the recommendation, with the numbers and a Why row", () => {
        render(<DeployRecommendation state={{ status: "ready", data: data() }} chosen="standard" onChoose={vi.fn()} fit={fit()} />);
        expect(screen.getByText("Too small for this server")).toBeTruthy();
        expect(screen.getByText("Needs about 2.1 GB · 2.0 GB free")).toBeTruthy();
        expect(screen.getByText("Upgrade memory to at least 2750 MB")).toBeTruthy();
        expect(screen.getAllByText("Why")).toHaveLength(2);
    });

    it("says so when the server has not reported numbers yet, and shows no fit row without data", () => {
        const { rerender } = render(<DeployRecommendation state={{ status: "ready", data: data() }} chosen="standard" onChoose={vi.fn()} fit={fit({ level: "unknown", available: null, headline: "No recent numbers from this server yet" })} />);
        expect(screen.getByText("No numbers from this server yet")).toBeTruthy();
        rerender(<DeployRecommendation state={{ status: "ready", data: data() }} chosen="standard" onChoose={vi.fn()} fit={null} />);
        expect(screen.queryByText("No recent numbers from this server yet")).toBeNull();
        expect(screen.getAllByText("Why")).toHaveLength(1);
    });
});

describe("DeployRecommendation: official image", () => {
    const data = { route: "ai", confidence: "high", reasons: [], isMonorepo: false, units: [], needs: [], composeServices: [], safeMigrationAvailable: false, resolvedSha: null, officialImage: { image: "neosmemo/memos", tag: "stable", port: 5230 } } as never;
    it("offers the project's own image as one flat row and lets the owner pick it", () => {
        const onChoose = vi.fn();
        render(<DeployRecommendation state={{ status: "ready", data }} chosen="ai" onChoose={onChoose} />);
        expect(screen.getByText(/Official image: neosmemo\/memos:stable/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Use official image" }));
        expect(onChoose).toHaveBeenCalledWith("image");
    });
    it("shows no such row when there is no official image", () => {
        render(<DeployRecommendation state={{ status: "ready", data: { ...(data as object), officialImage: null } as never }} chosen="ai" onChoose={() => {}} />);
        expect(screen.queryByText(/Official image/)).not.toBeInTheDocument();
    });
});

describe("DeployRecommendation with a plan preview (doc 64 S1.8)", () => {
    const plan = { verdict: "ready" as const, services: [{ id: "app", role: "backend", path: "" }], resources: [{ id: "postgres", kind: "postgres", usedBy: ["app"] }], skipped: [], steps: [], questions: [] };
    it("shows the plan rows in the same box when the AI-assisted way is chosen", () => {
        const { container } = render(<DeployRecommendation state={{ status: "ready", data: data({ route: "ai", plan }) }} chosen="ai" onChoose={vi.fn()} />);
        expect(screen.getByText("Opslin creates")).toBeTruthy();
        expect(container.querySelectorAll(".rounded-xl.border").length).toBe(1); // no box inside the box
    });
    it("hides them for the standard way", () => {
        render(<DeployRecommendation state={{ status: "ready", data: data({ route: "ai", plan }) }} chosen="standard" onChoose={vi.fn()} />);
        expect(screen.queryByText("Opslin creates")).toBeNull();
    });

    // jimmy-wax, 31 Oct 2026: "Best way: AI-assisted deploy, Confident" and "Tight on this server" sat above "Opslin can't deploy this
    // project yet". When the plan is a stop, the stop is the only thing shown.
    it("shows only the stop when the plan cannot be deployed", () => {
        const stop = { verdict: "unsupported" as const, services: [], resources: [], skipped: [], steps: [], persistent: [], questions: [{ code: "unsupported", severity: "unsupported" as const, message: "Unsupported: this repository runs as 3 separately built services." }] };
        const fit = { level: "tight", available: { ramMb: 2900 }, required: { ramMb: 1500 }, reasons: ["tight"], recommendation: null } as unknown as FitAssessmentData;
        render(<DeployRecommendation state={{ status: "ready", data: data({ route: "ai", plan: stop } as never) }} chosen="ai" onChoose={vi.fn()} fit={fit} />);
        expect(screen.getByText("Opslin can't deploy this project yet")).toBeTruthy();
        expect(screen.queryByText(/Best way/)).toBeNull();
        expect(screen.queryByText("Confident")).toBeNull();
        expect(screen.queryByText("Why")).toBeNull();
        expect(screen.queryByText(/Needs about/)).toBeNull();
    });

    it("keeps the official image as the way out of a stop", () => {
        const stop = { verdict: "unsupported" as const, services: [], resources: [], skipped: [], steps: [], persistent: [], questions: [{ code: "unsupported", severity: "unsupported" as const, message: "Unsupported: this repository runs as 3 separately built services." }] };
        const onChoose = vi.fn();
        render(<DeployRecommendation state={{ status: "ready", data: data({ route: "ai", plan: stop, officialImage: { image: "acme/shop", tag: "1.2.0" } } as never) }} chosen="ai" onChoose={onChoose} />);
        expect(screen.getByText("Opslin can't deploy this project yet")).toBeTruthy();
        expect(screen.queryByText(/Best way/)).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Use official image" }));
        expect(onChoose).toHaveBeenCalledWith("image");
    });
});
