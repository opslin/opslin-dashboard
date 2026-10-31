// Doc 66 S5.6 — the progress dialog says when Opslin restarted and picked a deploy up again, and shows a run stopped
// for review as something to check (neutral), not as a red failure.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { DeployProgressDialog } from "../DeployProgressDialog";

vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<object>()), api: { getServerJobStatus: vi.fn() } }));

function show(job: Record<string, unknown>) {
    vi.mocked(api.getServerJobStatus).mockResolvedValue(job as never);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}><DeployProgressDialog serverId="s" jobId="j" appLabel="shop" open onOpenChange={() => undefined} /></QueryClientProvider>);
}
const units = [{ unitPath: "apps/api", role: "backend", status: "blocked" }];

describe("DeployProgressDialog after a restart", () => {
    it("says the deploy was picked up again while it keeps running", async () => {
        show({ status: "RUNNING", deployProgress: { phase: "deploying", percent: 40, units: [{ unitPath: "apps/api", role: "backend", status: "deploying" }], message: null, updatedAt: "x", notice: "Opslin restarted and picked this deploy up again. Finished steps are not repeated." } });
        expect(await screen.findByText(/picked this deploy up again/)).toBeTruthy();
    });

    it("shows a run stopped for review as needing a check, not as failed", async () => {
        const error = "This deploy needs your review before it can continue: Opslin restarted while the live migration was running. The live database may already be changed; check it before continuing. Nothing was run twice.";
        show({ status: "FAILED", error, deployProgress: { phase: "failed", percent: 100, units, message: error, updatedAt: "x", needsReview: true } });
        expect(await screen.findByText("Needs your review")).toBeTruthy();
        expect(screen.queryByText("Deploy failed")).toBeNull();
        const reason = screen.getByText(/live database may already be changed/);
        expect(reason.className).not.toMatch(/destructive/);
    });

    it("still shows an ordinary failure as failed", async () => {
        show({ status: "FAILED", error: "The build failed.", deployProgress: { phase: "failed", percent: 100, units, message: "The build failed.", updatedAt: "x" } });
        expect(await screen.findByText("Deploy failed")).toBeTruthy();
    });
});
