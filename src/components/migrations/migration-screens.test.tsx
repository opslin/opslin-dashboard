// Every state of the migration screen, with the API replaced by a small fake: what is on screen, which action is
// offered, and that the copy states the real limits instead of promising zero loss or zero downtime.

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MigrationPlan, MigrationStatus, MigrationView, PlanItem } from "@/lib/migration-types";

const routerMock = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => routerMock, useParams: () => ({ id: "m1" }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));

const apiMock = vi.hoisted(() => ({
    getMigrations: vi.fn(),
    startMigration: vi.fn(),
    getMigration: vi.fn(),
    getMigrationDomains: vi.fn(),
    updateMigrationOptions: vi.fn(),
    confirmMigrationPlan: vi.fn(),
    rescanMigration: vi.fn(),
    retryMigration: vi.fn(),
    resumeMigration: vi.fn(),
    startMigrationCutover: vi.fn(),
    acceptMigration: vi.fn(),
    abortMigration: vi.fn(),
    recoverMigration: vi.fn(),
    clearMigrationCopy: vi.fn(),
    diagnoseMigration: vi.fn(),
    recheckMigrationFinal: vi.fn(),
    retryMigrationLinks: vi.fn(),
    checkMigrationLinks: vi.fn(),
    getServers: vi.fn(),
}));
vi.mock("@/lib/api", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api")>();
    return { ...actual, api: apiMock };
});

import { MigrationBody } from "./migration-detail";
import { MigrationsHome } from "./migrations-home";

const item = (over: Partial<PlanItem>): PlanItem => ({ key: "k", kind: "container", label: "x", disposition: "move", dependsOn: [], needsAck: false, ...over });

function makePlan(over: Partial<MigrationPlan> = {}): MigrationPlan {
    const items: PlanItem[] = [
        item({ key: "container:shop-api-1", label: "shop-api-1", detail: { image: "shop-api:latest" } }),
        item({ key: "container:shop-web-1", label: "shop-web-1", detail: { image: "nginx:1.27" } }),
        item({ key: "database:pg", kind: "database", label: "pg (postgresql 16)", bytes: 1_500_000_000, detail: { engine: "postgresql", version: "16-alpine" } }),
        item({ key: "volume:uploads", kind: "volume", label: "shop_uploads", bytes: 40_000_000 }),
        item({ key: "manual:cron", kind: "manual", label: "/etc/cron.d/backup", disposition: "manual", needsAck: true, reason: "1 scheduled job(s). Cron jobs are not moved automatically." }),
    ];
    return {
        version: 1, generatedAt: "2026-10-15T00:00:00Z", factsHash: "h", items, copyOrder: [], startOrder: [],
        checks: [
            { id: "target-docker", label: "Docker on the new server", status: "pass", detail: "Docker 27 is running." },
            { id: "target-disk", label: "Room on the new server", status: "warn", detail: "That fits, with little to spare." },
        ],
        domains: [], estimate: { prepareSec: { min: 120, max: 900 }, writePauseSec: { min: 90, max: 420 }, copyBytes: 1_540_000_000, assumptions: ["Data crosses at 3 MB/s to 15 MB/s."] },
        summary: { move: 4, manual: 1, blocked: 0, skip: 0, copyBytes: 1_540_000_000 }, needsAck: ["manual:cron"],
        risks: ["Writes made on the current server after the final copy starts are not carried over."], ready: true, notReadyReasons: [], ...over,
    };
}

function makeView(status: MigrationStatus, over: Partial<MigrationView> = {}): MigrationView {
    const stageOrder = ["look", "plan", "practice", "switch", "live"] as const;
    const idx = { DISCOVERING: 0, PLANNED: 1, PROVISIONING: 2, TRANSFERRING: 2, VERIFYING: 2, READY_FOR_CUTOVER: 2, CUTTING_OVER: 3, OBSERVING: 4 } as Record<string, number>;
    const cur = idx[status] ?? 4;
    return {
        id: "m1", status, createdAt: "2026-10-15T09:00:00Z", updatedAt: new Date().toISOString(), liveAt: null, writerOwner: "source",
        source: { id: "s1", name: "old-vps", ip: "203.0.113.5", hostname: null }, target: { id: "s2", name: "new-vps", ip: "203.0.113.9", hostname: null },
        stages: stageOrder.map((id, i) => ({ id, label: id, state: i < cur ? "done" : i === cur ? "current" : "pending" })),
        progress: { phase: "rehearsal", message: "Copying the database", percent: 40, stepsDone: 4, stepsTotal: 10, current: "x" },
        steps: [{ id: "a", label: "Preparing the new server", state: "done" }, { id: "b", label: "Copying the database", state: "current" }],
        failure: null, plan: makePlan(), planHash: "p".repeat(64), skip: [], scan: null, scanSummary: { source: null, target: null }, readiness: { newServerIp: null, oldServerIp: null, services: [] }, events: [{ id: "e1", at: "2026-10-15T09:01:00Z", kind: "stage", message: "Migration started." }],
        transfers: [], measured: null, verification: { rehearsal: null, final: null },
        actions: { canConfirm: false, canEditPlan: false, canCutover: false, canAccept: false, canAbort: false, canRetry: false, canRescan: false, canRecover: false, canResume: false, canClearCopy: false, canRetryLinks: false, canCheckLinks: false, canRecheck: false },
        apps: null, copy: null, keptFolders: [], finished: false, ...over,
    };
}

function renderWithClient(ui: React.ReactElement) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
    // Most tests are about the plan itself; the first screen (what each server holds) has its own tests below.
    window.sessionStorage.setItem("smi-plan-seen:m1", "1");
    Object.values(apiMock).forEach((fn) => fn.mockReset());
    toastMock.error.mockReset();
    apiMock.getMigrationDomains.mockResolvedValue({ targetIp: "203.0.113.9", sourceIp: "203.0.113.5", domains: [] });
});

const summary = (over: Partial<NonNullable<MigrationView["scanSummary"]["source"]>> = {}): NonNullable<MigrationView["scanSummary"]["source"]> => ({
    dockerFound: true, dockerVersion: "27", apps: 10, databases: 5, engines: ["postgresql", "mysql", "redis"], folders: 12, websites: 2, bytes: 3_000_000_000,
    usesNginx: true, empty: false, memoryMb: 4096, diskFreeMb: 30000, cpus: 2, hostname: "h", ...over,
});

describe("look at both servers", () => {
    beforeEach(() => window.sessionStorage.removeItem("smi-plan-seen:m1"));

    it("shows what is on each server with logos, and an empty new server as ready", () => {
        const view = makeView("PLANNED", { scanSummary: { source: summary(), target: summary({ apps: 0, databases: 0, engines: [], folders: 0, websites: 0, bytes: 0, usesNginx: false, empty: true }) }, actions: { ...makeView("PLANNED").actions, canRescan: true } });
        renderWithClient(<MigrationBody view={view} />);
        expect(screen.getByRole("heading", { name: "Both servers are checked" })).toBeInTheDocument();
        expect(screen.getByText("Old server")).toBeInTheDocument();
        expect(screen.getByText("New server")).toBeInTheDocument();
        expect(screen.getByText("Empty and ready")).toBeInTheDocument();
        expect(screen.getAllByText("storage folders")).toHaveLength(2);
        expect(screen.getByAltText("PostgreSQL")).toBeInTheDocument();
        expect(screen.getByAltText("Redis")).toBeInTheDocument();
        expect(screen.getByText("1.5 GB")).toBeInTheDocument();
        expect(screen.getByText("Nothing is changed on either server while we look.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Scan again" })).toBeEnabled();
    });

    it("says so while it is still looking, and the plan button waits", () => {
        renderWithClient(<MigrationBody view={makeView("DISCOVERING")} />);
        expect(screen.getByRole("heading", { name: "We are looking at both servers" })).toBeInTheDocument();
        expect(screen.getAllByText("Looking").length).toBeGreaterThan(0);
        expect(screen.getByRole("button", { name: /See my plan/ })).toBeDisabled();
    });

    it("warns when the new server has no Docker or already holds apps", () => {
        const noDocker = makeView("PLANNED", { scanSummary: { source: summary(), target: summary({ dockerFound: false, apps: 0, databases: 0, engines: [], folders: 0, websites: 0, empty: true }) } });
        const { unmount } = renderWithClient(<MigrationBody view={noDocker} />);
        expect(screen.getByText("Docker is missing here. Install it first.")).toBeInTheDocument();
        unmount();
        renderWithClient(<MigrationBody view={makeView("PLANNED", { scanSummary: { source: summary(), target: summary({ apps: 3 }) } })} />);
        expect(screen.getByText(/Already has 3 apps/)).toBeInTheDocument();
    });

    it("'See my plan' opens the plan and remembers it", () => {
        renderWithClient(<MigrationBody view={makeView("PLANNED", { scanSummary: { source: summary(), target: summary({ empty: true }) } })} />);
        fireEvent.click(screen.getByRole("button", { name: /See my plan/ }));
        expect(screen.getByRole("button", { name: /Start practice copy/ })).toBeInTheDocument();
        expect(window.sessionStorage.getItem("smi-plan-seen:m1")).toBe("1");
    });
});

describe("plan review", () => {
    const planned = () => makeView("PLANNED", {
        actions: { ...makeView("PLANNED").actions, canConfirm: true, canEditPlan: true, canAbort: true, canRescan: true },
        scanSummary: { source: summary({ memoryMb: 4096, cpus: 2 }), target: summary({ memoryMb: 8192, cpus: 4, diskFreeMb: 100000, empty: true }) },
    });

    it("shows what moves, what the owner handles, what cannot move, the data size, honest time ranges and the server comparison", () => {
        renderWithClient(<MigrationBody view={planned()} />);
        expect(screen.getByRole("heading", { name: "Here is what will happen" })).toBeInTheDocument();
        expect(screen.getByText("Will move")).toBeInTheDocument();
        expect(screen.getByText("You handle")).toBeInTheDocument();
        expect(screen.getByText("Cannot move")).toBeInTheDocument();
        expect(screen.getByText("Data to copy").parentElement).toHaveTextContent("1.5 GB");
        expect(screen.getByText("shop-api-1")).toBeInTheDocument();
        expect(screen.getByText("/etc/cron.d/backup")).toBeInTheDocument();
        expect(screen.getByText(/Cron jobs are not moved automatically/)).toBeInTheDocument();
        expect(screen.getByText(/about 2 to 15 minutes/)).toBeInTheDocument();
        expect(screen.getAllByText(/about 2 to 7 minutes/).length).toBeGreaterThan(0);
        expect(screen.getByText("Old server stays untouched")).toBeInTheDocument();
        expect(screen.getByLabelText("Server check")).toBeInTheDocument();
        expect(screen.getAllByText("Enough room").length).toBeGreaterThan(0);
        expect(screen.getByText("Docker on the new server")).toBeInTheDocument();
        expect(screen.getAllByAltText("PostgreSQL").length).toBeGreaterThan(0);
    });

    it("keeps Start disabled until every 'I understand' box is ticked, and says how many are left", async () => {
        apiMock.confirmMigrationPlan.mockResolvedValue(makeView("PROVISIONING"));
        renderWithClient(<MigrationBody view={planned()} />);
        const start = screen.getByRole("button", { name: /Start practice copy/ });
        expect(start).toBeDisabled();
        expect(screen.getByText("(1 left to tick)")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("checkbox", { name: "I understand: /etc/cron.d/backup" }));
        expect(start).toBeEnabled();
        fireEvent.click(start);
        await waitFor(() => expect(apiMock.confirmMigrationPlan).toHaveBeenCalledWith("m1", { planHash: "p".repeat(64), acknowledged: ["manual:cron"], skip: [] }));
    });

    it("one tick on 'I understand all' ticks every box, and unticking clears them", async () => {
        renderWithClient(<MigrationBody view={planned()} />);
        const start = screen.getByRole("button", { name: /Start practice copy/ });
        fireEvent.click(screen.getByRole("checkbox", { name: "I understand all" }));
        expect(screen.getByRole("checkbox", { name: "I understand: /etc/cron.d/backup" })).toBeChecked();
        expect(start).toBeEnabled();
        fireEvent.click(screen.getByRole("checkbox", { name: "I understand all" }));
        expect(screen.getByRole("checkbox", { name: "I understand: /etc/cron.d/backup" })).not.toBeChecked();
        expect(start).toBeDisabled();
    });

    it("shows the new server IP to copy, the timeline, and the services found in the settings with their checks", () => {
        const view = planned();
        view.readiness = {
            newServerIp: "203.0.113.9", oldServerIp: "203.0.113.5",
            services: [
                { id: "razorpay", name: "Razorpay", kind: "payments", evidence: ["RAZORPAY_KEY_ID"], checks: ["After the switch, make one small real payment and one refund.", "Check the webhook address."] },
                { id: "msg91", name: "MSG91", kind: "sms", evidence: ["MSG91_AUTH_KEY"], checks: ["Add the new address before switching."] },
            ],
        };
        renderWithClient(<MigrationBody view={view} />);
        const box = screen.getByLabelText("Before you switch");
        expect(within(box).getByText("203.0.113.9")).toBeInTheDocument();
        expect(within(box).getByText(/Keep the old IP too/)).toBeInTheDocument();
        const timeline = within(box).getByRole("list", { name: "Timeline" });
        expect(within(timeline).getByText(/Set the TTL of your domain to 5 minutes/)).toBeInTheDocument();
        expect(within(timeline).getByText(/quietest hour/)).toBeInTheDocument();
        expect(within(timeline).getByText(/your data on the new server is kept/)).toBeInTheDocument();
        expect(within(box).getByText("Razorpay")).toBeInTheDocument();
        expect(within(box).getByText("MSG91")).toBeInTheDocument();
        expect(within(box).getByText(/one small real payment/)).toBeInTheDocument();
        expect(within(box).getByText(/cannot tell you whether a provider will accept the new IP/)).toBeInTheDocument();
    });

    it("says so when no known service is found, and falls back to the new server's own address", () => {
        renderWithClient(<MigrationBody view={planned()} />);
        const box = screen.getByLabelText("Before you switch");
        expect(within(box).getByText(/No known payment, SMS, email or shipping service/)).toBeInTheDocument();
        expect(within(box).getByText("203.0.113.9")).toBeInTheDocument();
    });

    it("lets the owner leave an app behind", async () => {
        apiMock.updateMigrationOptions.mockResolvedValue(planned());
        renderWithClient(<MigrationBody view={planned()} />);
        fireEvent.click(screen.getByRole("switch", { name: "Move shop-web-1" }));
        await waitFor(() => expect(apiMock.updateMigrationOptions).toHaveBeenCalledWith("m1", { skip: ["container:shop-web-1"] }));
    });

    it("works out the saving from the two costs the owner types, and invents nothing", () => {
        renderWithClient(<MigrationBody view={planned()} />);
        expect(screen.queryByText(/You save/)).not.toBeInTheDocument();
        fireEvent.change(screen.getByLabelText("Old server cost per month"), { target: { value: "3000" } });
        expect(screen.queryByText(/You save/)).not.toBeInTheDocument();
        fireEvent.change(screen.getByLabelText("New server cost per month"), { target: { value: "1000" } });
        expect(screen.getByText("You save ₹2,000 per month")).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText("New server cost per month"), { target: { value: "4000" } });
        expect(screen.getByText("The new server costs ₹1,000 more per month")).toBeInTheDocument();
    });

    it("marks a server that is too small", () => {
        const view = planned();
        view.scanSummary = { source: summary({ memoryMb: 8192, cpus: 4 }), target: summary({ memoryMb: 2048, cpus: 2, diskFreeMb: 500, empty: true }) };
        renderWithClient(<MigrationBody view={view} />);
        expect(screen.getByText("Smaller")).toBeInTheDocument();
        expect(screen.getByText("Fewer")).toBeInTheDocument();
        expect(screen.getByText("Too small")).toBeInTheDocument();
    });

    it("offers no way forward when the plan is not ready, and says why", () => {
        const view = planned();
        view.plan = makePlan({ ready: false, notReadyReasons: ["The new server has 2 GB free and this move needs about 6 GB."], checks: [{ id: "target-disk", label: "Room on the new server", status: "fail", detail: "x" }] });
        renderWithClient(<MigrationBody view={view} />);
        expect(screen.queryByRole("button", { name: /Start practice copy/ })).not.toBeInTheDocument();
        expect(screen.getByText(/needs about 6 GB/)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Scan again" })).toBeInTheDocument();
    });

    it("never promises zero loss or zero downtime", () => {
        const { container } = renderWithClient(<MigrationBody view={planned()} />);
        expect(container.textContent).not.toMatch(/zero|no downtime|guarantee|lossless|100%/i);
    });
});

describe("the activity log", () => {
    it("is a box of fixed height that scrolls inside itself, newest first, with a count", () => {
        const events = Array.from({ length: 40 }, (_, i) => ({ id: `e${i}`, at: new Date(Date.UTC(2026, 9, 17, 3, 0, i)).toISOString(), kind: (i === 39 ? "error" : "item") as "error" | "item", message: `Step ${i + 1}` }));
        renderWithClient(<MigrationBody view={makeView("TRANSFERRING", { events })} />);
        const log = screen.getByRole("region", { name: "Activity log" });
        expect(log.className).toMatch(/max-h-72/);
        expect(log.className).toMatch(/overflow-y-auto/);
        const items = within(log).getAllByRole("listitem");
        expect(items).toHaveLength(40);
        expect(items[0]).toHaveTextContent("Step 40");
        expect(items[39]).toHaveTextContent("Step 1");
        expect(screen.getByText("Activity").closest("details")).not.toHaveAttribute("open");
        expect(screen.getByText("40")).toBeInTheDocument();
    });
});

describe("while it runs", () => {
    const steps = [
        { id: "prepare", label: "Preparing the new server", state: "done" as const },
        { id: "rehearsal:copy-out:image:sha256:1", label: "Reading the image shop-api", state: "done" as const },
        { id: "rehearsal:copy-out:database:pg", label: "Reading the database pg", state: "current" as const },
        { id: "rehearsal:copy-out:volume:uploads", label: "Reading the volume shop_uploads", state: "pending" as const },
        { id: "rehearsal:check", label: "Checking the practice copy works", state: "pending" as const },
    ];

    it("shows the moving copy, the progress, the five plain steps and that the old server is untouched", () => {
        renderWithClient(<MigrationBody view={makeView("TRANSFERRING", { steps, actions: { ...makeView("PLANNED").actions, canAbort: true } })} />);
        expect(screen.getByRole("heading", { name: "We are making a practice copy" })).toBeInTheDocument();
        expect(screen.getByLabelText(/Copying from old-vps to new-vps/)).toBeInTheDocument();
        expect(screen.getByRole("progressbar", { name: "Progress" })).toHaveAttribute("aria-valuenow", "40");
        expect(screen.getByText("40%")).toBeInTheDocument();
        expect(screen.getByText(/left \(an estimate\)/)).toBeInTheDocument();
        const list = screen.getByRole("list", { name: "Steps" });
        expect(within(list).getByText("1. Prepare the new server")).toBeInTheDocument();
        expect(within(list).getByText("3. Copy databases")).toBeInTheDocument();
        expect(within(list).getAllByText("Done")).toHaveLength(2);
        expect(within(list).getByText("Working")).toBeInTheDocument();
        expect(within(list).getAllByText("Waiting")).toHaveLength(2);
        expect(screen.getByText(/Reading the database pg/)).toBeInTheDocument();
        expect(screen.getByText(/is still serving customers. Nothing is changed there./)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Cancel and clean up" })).toBeInTheDocument();
        expect(screen.getByText("Activity").closest("details")).not.toHaveAttribute("open");
    });

    it("says on each screen why the data is copied twice, in plain words", () => {
        const a = renderWithClient(<MigrationBody view={makeView("TRANSFERRING", { steps })} />);
        expect(screen.getByLabelText("Why the data is copied twice")).toHaveTextContent(/This is a practice copy.*out of date.*copied once more during the switch/);
        a.unmount();
        const b = renderWithClient(<MigrationBody view={makeView("READY_FOR_CUTOVER", { actions: { ...makeView("PLANNED").actions, canCutover: true } })} />);
        expect(screen.getByLabelText("Why the data is copied twice")).toHaveTextContent(/copied once more.*not a single new order is lost.*Apps are not copied again/);
        b.unmount();
        renderWithClient(<MigrationBody view={makeView("CUTTING_OVER", { writerOwner: "none" })} />);
        expect(screen.getByLabelText("Why the data is copied twice")).toHaveTextContent(/second and final copy.*stopped.*practice copy was only a test/);
    });

    it("names what is being copied the way the plan does, never by an internal key or image hash", () => {
        const base = makePlan();
        const plan = { ...base, items: [...base.items, item({ key: "image:sha256:" + "ab".repeat(32), kind: "image", label: "postgres:16-alpine" })] };
        const view = makeView("TRANSFERRING", {
            plan,
            steps: [{ id: "rehearsal:copy-out:image:sha256:" + "ab".repeat(32), label: "Reading the image postgres:16-alpine", state: "current" }],
            transfers: [{ itemKey: "image:sha256:" + "ab".repeat(32), kind: "image", phase: "rehearsal", status: "uploading", bytes: 46_000_000, bytesHint: null }],
        });
        renderWithClient(<MigrationBody view={view} />);
        expect(screen.getByText(/46.0 MB \(postgres:16-alpine\)/)).toBeInTheDocument();
        expect(screen.queryByText(/sha256/)).not.toBeInTheDocument();
    });

    const switchSteps = [
        { id: "cutover:rescan", label: "Checking nothing changed since the plan was made", state: "done" as const },
        { id: "cutover:fence", label: "Stopping your apps on the current server so no new data is written", state: "done" as const },
        { id: "cutover:counts", label: "Counting what is in your databases", state: "done" as const },
        { id: "cutover:teardown", label: "Clearing the practice copy", state: "done" as const },
        { id: "final:copy-out:database:pg", label: "Reading the database pg", state: "current" as const },
        { id: "final:copy-in:database:pg", label: "Writing the database pg", state: "pending" as const },
        { id: "cutover:activate", label: "Starting everything on the new server", state: "pending" as const },
        { id: "cutover:check", label: "Checking the new server serves correctly", state: "pending" as const },
    ];

    it("shows the switch as five plain steps, a running timer and says the old apps are paused", () => {
        renderWithClient(<MigrationBody view={makeView("CUTTING_OVER", { writerOwner: "none", steps: switchSteps, progress: { phase: "cutover", message: "x", percent: 50, stepsDone: 4, stepsTotal: 8, current: "final:copy-out:database:pg" }, events: [{ id: "e", at: new Date(Date.now() - 65_000).toISOString(), kind: "stage", message: "Switching over. Your apps on the current server will stop for a short while." }] })} />);
        expect(screen.getByRole("heading", { name: "We are switching to the new server" })).toBeInTheDocument();
        expect(screen.getByText(/Your apps on old-vps are paused so no new data is written/)).toBeInTheDocument();
        expect(screen.getByText(/Please do not switch off either server/)).toBeInTheDocument();
        const steps = screen.getByRole("list", { name: "Switch steps" });
        expect(within(steps).getByText("1. Check nothing changed")).toBeInTheDocument();
        expect(within(steps).getByText("2. Stop the old apps")).toBeInTheDocument();
        expect(within(steps).getByText("3. Copy the last data")).toBeInTheDocument();
        expect(within(steps).getByText("4. Start on the new server")).toBeInTheDocument();
        expect(within(steps).getByText("5. Test it")).toBeInTheDocument();
        expect(within(steps).getAllByText("Done")).toHaveLength(2);
        expect(within(steps).getByText("Working")).toBeInTheDocument();
        expect(within(steps).getAllByText("Waiting")).toHaveLength(2);
        expect(screen.getByRole("progressbar", { name: "Progress" })).toHaveAttribute("aria-valuenow", "50");
        expect(screen.getByText("Step 5 of 8")).toBeInTheDocument();
        expect(screen.getByLabelText(/1 minutes \d+ seconds/)).toBeInTheDocument();
        expect(screen.getByText(/start again on old-vps by themselves/)).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Cancel migration" })).not.toBeInTheDocument();
    });

    it("before the old apps stop it says they are still running", () => {
        renderWithClient(<MigrationBody view={makeView("CUTTING_OVER", { writerOwner: "source", steps: switchSteps.map((s, i) => ({ ...s, state: i === 0 ? "current" : "pending" })) })} />);
        expect(screen.getByText(/still running on old-vps. They stop in a moment/)).toBeInTheDocument();
    });

    it("offers to nudge a migration that has gone quiet", () => {
        const view = makeView("TRANSFERRING", { steps, updatedAt: new Date(Date.now() - 10 * 60_000).toISOString(), actions: { ...makeView("PLANNED").actions, canResume: true } });
        renderWithClient(<MigrationBody view={view} />);
        expect(screen.getByText(/Nothing has happened for a few minutes/)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    });
});

describe("ready to switch", () => {
    const ready = (over: Partial<MigrationView> = {}) =>
        makeView("READY_FOR_CUTOVER", {
            actions: { ...makeView("PLANNED").actions, canCutover: true, canAbort: true },
            verification: { rehearsal: [
                { id: "container:api", label: "Container api keeps running", status: "pass", detail: "Running without restarts." },
                { id: "db:pg", label: "The database pg restored", status: "pass", detail: "3 tables, 3790 rows." },
                { id: "port:api:8080/tcp", label: "api answers on port 8080", status: "warn", detail: "It answers, but with an error (HTTP 502)." },
            ], final: null },
            ...over,
        });

    it("groups the checks into rows a person recognizes and keeps the old server running", () => {
        renderWithClient(<MigrationBody view={ready()} />);
        expect(screen.getByRole("heading", { name: "Practice copy is ready" })).toBeInTheDocument();
        expect(screen.getByLabelText("The copy reached the new server")).toBeInTheDocument();
        const list = screen.getByRole("list", { name: "What the practice copy checked" });
        expect(within(list).getByText("1. Apps started")).toBeInTheDocument();
        expect(within(list).getByText("2. Databases restored")).toBeInTheDocument();
        expect(within(list).getByText("3. Websites answer")).toBeInTheDocument();
        expect(within(list).getByText(/HTTP 502/)).toBeInTheDocument();
        expect(within(list).getAllByText("Passed")).toHaveLength(2);
        expect(within(list).getByText("Look at this")).toBeInTheDocument();
        expect(screen.getByText(/1 check to look at; none stops the switch/)).toBeInTheDocument();
        expect(screen.getByText(/is still serving customers/)).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "I will switch later" })).toHaveAttribute("href", "/migrations");
    });

    it("asks 'Ready to switch?' in three plain steps, and only switches after the owner ticks that the website pauses", async () => {
        apiMock.startMigrationCutover.mockResolvedValue(makeView("CUTTING_OVER"));
        renderWithClient(<MigrationBody view={ready()} />);
        fireEvent.click(screen.getByRole("button", { name: /Switch now/ }));
        const dialog = await screen.findByRole("alertdialog");
        expect(within(dialog).getByText("Ready to switch?")).toBeInTheDocument();
        const steps = within(dialog).getByRole("list", { name: "What happens" });
        expect(within(steps).getByText(/1\. Your old apps stop for about/)).toBeInTheDocument();
        expect(within(steps).getByText("2. We copy the newest data")).toBeInTheDocument();
        expect(within(steps).getByText("3. The new server starts and is tested")).toBeInTheDocument();
        expect(within(dialog).getByText(/your apps start again on old-vps/)).toBeInTheDocument();
        expect(within(dialog).getByText(/moving back does not bring that new data with it/)).toBeInTheDocument();
        const go = within(dialog).getByRole("button", { name: "Switch now" });
        expect(go).toBeDisabled();
        fireEvent.click(within(dialog).getByRole("checkbox", { name: /I understand the website pauses/ }));
        expect(go).toBeEnabled();
        expect(apiMock.startMigrationCutover).not.toHaveBeenCalled();
        fireEvent.click(go);
        await waitFor(() => expect(apiMock.startMigrationCutover).toHaveBeenCalledWith("m1", { planHash: "p".repeat(64), confirm: true }));
    });

    it("'Not yet' closes it without switching", async () => {
        renderWithClient(<MigrationBody view={ready()} />);
        fireEvent.click(screen.getByRole("button", { name: /Switch now/ }));
        const dialog = await screen.findByRole("alertdialog");
        fireEvent.click(within(dialog).getByRole("button", { name: "Not yet" }));
        await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
        expect(apiMock.startMigrationCutover).not.toHaveBeenCalled();
    });

    it("uses the measured copy speed once there is one", () => {
        renderWithClient(<MigrationBody view={ready({ measured: { bytesPerSec: 8_000_000, finalCopySec: 200 } })} />);
        expect(screen.getByText(/from the speed of your practice copy/)).toBeInTheDocument();
    });

    it("tells the owner when the last switch attempt failed and that the old server is running", () => {
        renderWithClient(<MigrationBody view={ready({ failure: { stage: "cutover", message: "no space left on device", sourceRestored: true } })} />);
        expect(screen.getByText(/The last switch didn't start: no space left on device/)).toBeInTheDocument();
        expect(screen.getByText(/Your apps are running on old-vps/)).toBeInTheDocument();
    });
});

describe("live on the new server", () => {
    const report = (over: Partial<NonNullable<NonNullable<MigrationView["apps"]>[number]["precheck"]>> = {}) => ({
        checkedAt: new Date().toISOString(), url: "https://shop-ab12.agnixstudio.in/", reached: true, status: 200,
        findings: [
            { id: "cookie-domain", level: "problem" as const, title: "Cookies are set for the old domain", detail: "sessionid is set for another domain.", fix: "Clear the cookie domain setting." },
            { id: "host-check", level: "problem" as const, title: "The project refuses this host name", detail: "Django's host check.", fix: "Add shop-ab12.agnixstudio.in to ALLOWED_HOSTS." },
            { id: "old-links", level: "warning" as const, title: "The page mentions your old address", detail: "shop.example.com appears in the page." },
            { id: "cloudflare-limits", level: "info" as const, title: "The temporary address goes through Cloudflare", detail: "Uploads over 100 MB do not work." },
        ],
        summary: { problems: 2, warnings: 1 }, disclaimer: "quick look", notChecked: ["Signing in, and anything after you are signed in"], ...over,
    });
    const app = (over: Partial<NonNullable<MigrationView["apps"]>[number]> = {}): NonNullable<MigrationView["apps"]>[number] => ({
        key: "site:shop.example.com", label: "shop.example.com", names: ["shop.example.com"], container: "shop-web-1", port: 8080, appId: "app-1",
        domain: "shop-ab12.agnixstudio.in", url: "https://shop-ab12.agnixstudio.in", state: "ready", note: null, precheck: report(), updatedAt: new Date().toISOString(), ...over,
    });
    const live = (apps: MigrationView["apps"] = [app()], over: Partial<MigrationView> = {}) =>
        makeView("OBSERVING", {
            writerOwner: "target", apps, liveAt: new Date(new Date("2026-10-15T09:00:00Z").getTime() + 18 * 60_000).toISOString(),
            actions: { ...makeView("PLANNED").actions, canAccept: true, canRecover: true, canRetryLinks: true, canCheckLinks: true },
            verification: { rehearsal: null, final: [{ id: "a", label: "Database has the same contents as before", status: "pass", detail: "every count matches" }] },
            ...over,
        });

    it("says the project is running, with the old server stopped and safe", () => {
        renderWithClient(<MigrationBody view={live()} />);
        expect(screen.getByRole("heading", { name: "Your project is now running on the new server" })).toBeInTheDocument();
        expect(screen.getByText("stopped and safe")).toBeInTheDocument();
        expect(screen.getByText("live")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Everything works – finish/ })).toBeEnabled();
        expect(screen.getByRole("button", { name: /Go back to the old server/ })).toBeEnabled();
    });

    it("shows each app with its temporary address and an Open site button that opens in a new tab", () => {
        renderWithClient(<MigrationBody view={live()} />);
        expect(screen.getByRole("link", { name: "shop.example.com" })).toHaveAttribute("href", "/apps/app-1");
        const open = screen.getByRole("link", { name: /Open site/ });
        expect(open).toHaveAttribute("href", "https://shop-ab12.agnixstudio.in");
        expect(open).toHaveAttribute("target", "_blank");
        expect(open).toHaveAttribute("rel", expect.stringContaining("noopener"));
        expect(screen.getByText("2 problems, 1 note")).toBeInTheDocument();
    });

    it("opens the first app that has problems, listing each with its fix, and says it is only a quick look", () => {
        renderWithClient(<MigrationBody view={live()} />);
        expect(screen.getByText("Cookies are set for the old domain")).toBeInTheDocument();
        expect(screen.getByText(/Add shop-ab12\.agnixstudio\.in to ALLOWED_HOSTS\./)).toBeInTheDocument();
        expect(screen.getByText("The page mentions your old address")).toBeInTheDocument();
        expect(screen.getByText("The temporary address goes through Cloudflare")).toBeInTheDocument();
        expect(screen.getByText(/This is a quick look, not proof that everything works/)).toBeInTheDocument();
        expect(screen.getByText("What this check does not test")).toBeInTheDocument();
    });

    it("folds the list when the badge is pressed", () => {
        renderWithClient(<MigrationBody view={live()} />);
        fireEvent.click(screen.getByRole("button", { name: "Likely problems for shop.example.com" }));
        expect(screen.queryByText("Cookies are set for the old domain")).not.toBeInTheDocument();
    });

    it("says 'No problems' for a clean report and 'Checking' until the first report is in", async () => {
        const clean = report({ findings: [{ id: "opens", level: "ok", title: "The home page opens", detail: "ok" }], summary: { problems: 0, warnings: 0 } });
        const { unmount } = renderWithClient(<MigrationBody view={live([app({ precheck: clean })])} />);
        expect(screen.getByText("No problems")).toBeInTheDocument();
        unmount();
        renderWithClient(<MigrationBody view={live([app({ precheck: null })])} />);
        expect(screen.getByText("Checking")).toBeInTheDocument();
    });

    it("checks again on request", async () => {
        apiMock.checkMigrationLinks.mockResolvedValue(live());
        renderWithClient(<MigrationBody view={live()} />);
        fireEvent.click(screen.getByRole("button", { name: "Check again" }));
        await waitFor(() => expect(apiMock.checkMigrationLinks).toHaveBeenCalledWith("m1", "site:shop.example.com"));
    });

    it("a site that could not get an address says why and offers Try again", async () => {
        apiMock.retryMigrationLinks.mockResolvedValue(live());
        renderWithClient(<MigrationBody view={live([app({ state: "failed", url: null, precheck: null, note: "The temporary address could not be created: Cloudflare said no" })])} />);
        expect(screen.getByRole("alert")).toHaveTextContent("Cloudflare said no");
        expect(screen.queryByRole("link", { name: /Open site/ })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Try again" }));
        await waitFor(() => expect(apiMock.retryMigrationLinks).toHaveBeenCalledWith("m1"));
    });

    it("a site with no temporary address is listed with the reason, not hidden", () => {
        renderWithClient(<MigrationBody view={live([app({ state: "skipped", url: null, domain: null, appId: null, precheck: null, note: "A container with its own web server serves this site, so there is no temporary address for it yet." })])} />);
        expect(screen.getByText("No temporary address")).toBeInTheDocument();
        expect(screen.getByText(/own web server serves this site/)).toBeInTheDocument();
    });

    it("walks through using your own domain, shows the new server IP to copy and where each name points", async () => {
        apiMock.getMigrationDomains.mockResolvedValue({
            targetIp: "203.0.113.9", sourceIp: "203.0.113.5",
            domains: [{ name: "shop.example.com", state: "current-server", addresses: ["203.0.113.5"] }, { name: "www.shop.example.com", state: "new-server", addresses: ["203.0.113.9"] }],
        });
        renderWithClient(<MigrationBody view={live()} />);
        expect(screen.getByText("Point your domain to this new server IP.")).toBeInTheDocument();
        expect(await screen.findByText("Still points to the old server")).toBeInTheDocument();
        expect(screen.getByText("203.0.113.9")).toBeInTheDocument();
        expect(screen.getByText("Points to the new server")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Add my domain" })).toHaveAttribute("href", "/apps/app-1?section=domains");
    });

    it("says plainly that an address which used HTTPS arrives over plain HTTP", async () => {
        const plan = makePlan({ domains: [{ names: ["shop.example.com", "www.shop.example.com"], tls: true, sourceFile: "/etc/nginx/sites-enabled/shop", movable: true }] });
        renderWithClient(<MigrationBody view={live([app()], { plan })} />);
        expect(await screen.findByText(/shop\.example\.com used HTTPS on old-vps/)).toBeInTheDocument();
        expect(screen.getByText(/does not set up certificates for moved sites yet/)).toBeInTheDocument();
    });

    it("shows what was gained: the time it took and the data moved", () => {
        renderWithClient(<MigrationBody view={live()} />);
        expect(screen.getByText("Time taken")).toBeInTheDocument();
        expect(screen.getByText("18 minutes")).toBeInTheDocument();
        expect(screen.getByText("Data moved")).toBeInTheDocument();
        expect(screen.queryByText("Money saved")).not.toBeInTheDocument();
    });

    it("shows the money saved only when the owner typed both costs on the plan", () => {
        window.localStorage.setItem("smi-costs:m1", JSON.stringify({ old: "3000", neu: "1000" }));
        renderWithClient(<MigrationBody view={live()} />);
        expect(screen.getByText("₹2,000 per month")).toBeInTheDocument();
        window.localStorage.removeItem("smi-costs:m1");
    });

    it("explains that moving back does not carry new data, and that the apps are removed", async () => {
        renderWithClient(<MigrationBody view={live()} />);
        fireEvent.click(screen.getByRole("button", { name: /Go back to the old server/ }));
        const dialog = await screen.findByRole("alertdialog");
        expect(within(dialog).getByText(/Anything new-vps saved since the switch is not carried back/)).toBeInTheDocument();
        expect(within(dialog).getByText(/apps and temporary addresses made for the moved sites are removed/)).toBeInTheDocument();
    });

    it("finishing asks for no confirmation and moves the migration on", async () => {
        apiMock.acceptMigration.mockResolvedValue(makeView("ACCEPTED", { finished: true }));
        renderWithClient(<MigrationBody view={live()} />);
        fireEvent.click(screen.getByRole("button", { name: /Everything works – finish/ }));
        await waitFor(() => expect(apiMock.acceptMigration).toHaveBeenCalledWith("m1"));
    });

    it("after Accept the same page stays, without the two decisions", () => {
        renderWithClient(<MigrationBody view={makeView("ACCEPTED", { finished: true, apps: [app()], writerOwner: "target" })} />);
        expect(screen.getByRole("heading", { name: "Your project is running on the new server" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /Open site/ })).toHaveAttribute("href", "https://shop-ab12.agnixstudio.in");
        expect(screen.queryByRole("button", { name: /Everything works/ })).not.toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Start another migration" })).toBeInTheDocument();
    });

    it("'Find out why' reads the new server's errors and explains each cause with what to do, saying it is not a copy failure", async () => {
        apiMock.diagnoseMigration.mockResolvedValue({
            checkedAt: new Date().toISOString(), window: "30 minutes", containers: 2, errorLines: 3,
            reassurance: "This is not a copy failure. Opslin copied your data and checked that every database count matches the old server.",
            disclaimer: "This is a best guess from the last few minutes of error messages.",
            causes: [
                { id: "no-answer", level: "likely", title: "MSG91 did not answer the new server", meaning: "The new server could not reach it.", services: ["MSG91"], count: 3, fix: ["If MSG91 has an allowed-address list, add 203.0.113.9.", "Check the firewall."], example: "connect ETIMEDOUT api.msg91.com:443" },
                { id: "dns", level: "possible", title: "The new server cannot look up some names", meaning: "A name could not be turned into an address.", services: [], count: 1, fix: ["Check the DNS settings."], example: null },
            ],
        });
        renderWithClient(<MigrationBody view={live()} />);
        expect(screen.queryByText(/This is not a copy failure/)).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Find out why" }));
        expect(await screen.findByText(/This is not a copy failure/)).toBeInTheDocument();
        expect(screen.getByText("MSG91 did not answer the new server")).toBeInTheDocument();
        expect(screen.getByText("Most likely")).toBeInTheDocument();
        expect(screen.getByText("Possible")).toBeInTheDocument();
        expect(screen.getByText("seen 3 times")).toBeInTheDocument();
        expect(screen.getByText(/add 203\.0\.113\.9/)).toBeInTheDocument();
        expect(screen.getByText("connect ETIMEDOUT api.msg91.com:443")).toBeInTheDocument();
        expect(screen.getByText(/best guess/)).toBeInTheDocument();
        expect(apiMock.diagnoseMigration).toHaveBeenCalledWith("m1");
        expect(screen.getByRole("button", { name: "Look again" })).toBeInTheDocument();
    });

    it("says plainly when the new server has written no errors, and still reassures", async () => {
        apiMock.diagnoseMigration.mockResolvedValue({ checkedAt: new Date().toISOString(), window: "30 minutes", containers: 2, errorLines: 0, causes: [], reassurance: "This is not a copy failure. Opslin copied your data.", disclaimer: "best guess" });
        renderWithClient(<MigrationBody view={live()} />);
        fireEvent.click(screen.getByRole("button", { name: "Find out why" }));
        expect(await screen.findByText(/No error messages in the last 30 minutes on 2 containers/)).toBeInTheDocument();
        expect(screen.getByText(/not a copy failure/)).toBeInTheDocument();
    });

    it("shows no apps block for a migration with no moved sites", () => {
        renderWithClient(<MigrationBody view={live(null)} />);
        expect(screen.queryByLabelText("Your apps")).not.toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Your project is now running on the new server" })).toBeInTheDocument();
    });
});

describe("when it stops", () => {
    it("a failure before anything was switched says the old server is untouched, in the failure colour", () => {
        const view = makeView("FAILED", {
            failure: { stage: "prepare", message: "Docker is not running on the new server", retryable: true, sourceRestored: true },
            actions: { ...makeView("PLANNED").actions, canRetry: true, canAbort: true },
        });
        renderWithClient(<MigrationBody view={view} />);
        const message = screen.getByText("Docker is not running on the new server");
        expect(message.closest("div")?.className).toMatch(/text-destructive/);
        expect(screen.getByText(/Your apps are still running on old-vps\. Nothing there was changed/)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Cancel migration" })).toBeInTheDocument();
    });

    it("a state that needs a human decision is not red and offers Recover service, not a quiet retry", () => {
        const view = makeView("RECOVERY_REQUIRED", {
            writerOwner: "target",
            failure: { message: "connection lost", retryable: false, sourceRestored: false },
            actions: { ...makeView("PLANNED").actions, canRecover: true },
        });
        renderWithClient(<MigrationBody view={view} />);
        expect(screen.getByText("Needs your decision")).toBeInTheDocument();
        expect(screen.getByText(/new-vps may already be saving data, so nothing was changed back by itself/)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Recover service" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
        expect(screen.queryByText(/Nothing there was changed/)).not.toBeInTheDocument();
    });
});

describe("finished", () => {
    it.each([
        ["ROLLED_BACK", /running on old-vps again/],
        ["ABORTED", /Nothing on old-vps was changed/],
    ] as const)("%s", (status, text) => {
        renderWithClient(<MigrationBody view={makeView(status, { finished: true })} />);
        expect(screen.getByText(text)).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Start another migration" })).toHaveAttribute("href", "/migrations");
    });
});

describe("while moving back or cancelling", () => {
    it("shows progress and says 'Moving back' instead of the live screen's decisions", () => {
        const view = makeView("OBSERVING", {
            writerOwner: "target",
            progress: { phase: "recover", message: "Stopping your apps on the new server", percent: 20, stepsDone: 0, stepsTotal: 2, current: "recover:deactivate" },
            actions: { ...makeView("OBSERVING").actions, canAccept: false, canRecover: false },
        });
        renderWithClient(<MigrationBody view={view} />);
        expect(screen.getByRole("heading", { name: "Moving back to old-vps" })).toBeInTheDocument();
        expect(screen.getAllByText("Stopping your apps on the new server").length).toBeGreaterThan(0);
        expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Recover service" })).not.toBeInTheDocument();
    });

    it("says 'Cancelling' while the practice copy is being removed", () => {
        const view = makeView("READY_FOR_CUTOVER", { progress: { phase: "abort", message: "Removing what was created on the new server", percent: 0, stepsDone: 0, stepsTotal: 1, current: null } });
        renderWithClient(<MigrationBody view={view} />);
        expect(screen.getByRole("heading", { name: "Cancelling and cleaning up" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Switch to the new server" })).not.toBeInTheDocument();
    });

    it("when only the final check failed, says the move itself finished and offers to run just that check again", async () => {
        apiMock.recheckMigrationFinal.mockResolvedValue(makeView("CUTTING_OVER"));
        const view = makeView("RECOVERY_REQUIRED", {
            writerOwner: "target",
            failure: { stage: "cutover:check", message: "Container shop-scheduler-1 keeps running failed: It stopped with exit code 1.", retryable: false, sourceRestored: false },
            progress: { phase: "cutover", message: "Needs your decision", percent: 90, stepsDone: 10, stepsTotal: 11, current: null },
            actions: { ...makeView("OBSERVING").actions, canRecover: true, canRecheck: true },
        });
        renderWithClient(<MigrationBody view={view} />);
        expect(screen.getByText(/The move itself finished: your data was copied and every database count matched/)).toBeInTheDocument();
        expect(screen.getByText(/nothing is copied, stopped or started/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Check again" }));
        await waitFor(() => expect(apiMock.recheckMigrationFinal).toHaveBeenCalledWith("m1"));
        expect(screen.getByRole("button", { name: "Recover service" })).toBeInTheDocument();
    });

    it("offers no re-check for any other failure", () => {
        renderWithClient(<MigrationBody view={makeView("RECOVERY_REQUIRED", { failure: { stage: "cutover:activate", message: "x", retryable: false, sourceRestored: false }, actions: { ...makeView("OBSERVING").actions, canRecover: true } })} />);
        expect(screen.queryByRole("button", { name: "Check again" })).not.toBeInTheDocument();
    });

    it("goes back to the decision when the move back failed", () => {
        const view = makeView("RECOVERY_REQUIRED", {
            failure: { message: "Could not move back automatically: docker: cannot connect", retryable: false, sourceRestored: false },
            progress: { phase: "idle", message: "Could not move back automatically", percent: 0, stepsDone: 0, stepsTotal: 0, current: null },
            actions: { ...makeView("OBSERVING").actions, canRecover: true },
        });
        renderWithClient(<MigrationBody view={view} />);
        expect(screen.getByRole("button", { name: "Recover service" })).toBeInTheDocument();
        expect(screen.getByText("Needs your decision")).toBeInTheDocument();
    });
});

describe("after moving back", () => {
    const rolledBack = (over: Partial<MigrationView> = {}) =>
        makeView("ROLLED_BACK", { finished: true, copy: "kept", actions: { ...makeView("ROLLED_BACK").actions, canClearCopy: true }, ...over });

    it("says a stopped copy is still on the new server and offers to remove it, after a confirmation", async () => {
        apiMock.clearMigrationCopy.mockResolvedValue(rolledBack({ copy: "removing", actions: { ...makeView("ROLLED_BACK").actions, canClearCopy: false } }));
        renderWithClient(<MigrationBody view={rolledBack()} />);
        expect(screen.getByText(/stopped copy of your apps and data is still on new-vps/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Remove the copy" }));
        // Nothing is deleted by the first click.
        expect(apiMock.clearMigrationCopy).not.toHaveBeenCalled();
        const dialog = await screen.findByRole("alertdialog");
        expect(within(dialog).getByText(/Real folders on new-vps are never deleted/)).toBeInTheDocument();
        expect(within(dialog).getByText(/old-vps is not touched/)).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole("button", { name: "Remove the copy" }));
        await waitFor(() => expect(apiMock.clearMigrationCopy).toHaveBeenCalledWith("m1"));
    });

    it("shows progress while the copy is being removed, and the result afterwards", () => {
        const { unmount } = renderWithClient(<MigrationBody view={rolledBack({ copy: "removing" })} />);
        expect(screen.getByText(/Removing the copy from new-vps/)).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Remove the copy" })).not.toBeInTheDocument();
        unmount();
        renderWithClient(<MigrationBody view={rolledBack({ copy: "removed" })} />);
        expect(screen.getByText(/The copy was removed from new-vps/)).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Remove the copy" })).not.toBeInTheDocument();
    });

    it("lists the real folders Opslin left behind, and how to move them aside before trying again", () => {
        renderWithClient(<MigrationBody view={rolledBack({ copy: "removed", keptFolders: ["/srv/shop/html", "/srv/shop/app.conf"] })} />);
        fireEvent.click(screen.getByText("Folders left on new-vps"));
        expect(screen.getByText("/srv/shop/html")).toBeInTheDocument();
        expect(screen.getByText("/srv/shop/app.conf")).toBeInTheDocument();
        expect(screen.getByText(/Opslin never deletes real folders/)).toBeInTheDocument();
        expect(screen.getByText("sudo mv /srv/shop/html /srv/shop/html.old")).toBeInTheDocument();
    });

    it("shows none of this for a migration that was accepted", () => {
        renderWithClient(<MigrationBody view={makeView("ACCEPTED", { finished: true, keptFolders: ["/srv/shop/html"] })} />);
        expect(screen.queryByText(/Folders left on/)).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Remove the copy" })).not.toBeInTheDocument();
    });
});

describe("after a cancel that could not clean up", () => {
    const leftBehind = (over: Partial<MigrationView> = {}) =>
        makeView("ABORTED", {
            finished: true, copy: "kept",
            progress: { phase: "idle", message: "Cancelled; some of the copy is still on the new server", percent: 100, stepsDone: 0, stepsTotal: 0, current: null },
            actions: { ...makeView("ABORTED").actions, canClearCopy: true }, ...over,
        });

    it("says part of the practice copy is still on the new server and offers to remove it, after a confirmation", async () => {
        apiMock.clearMigrationCopy.mockResolvedValue(leftBehind({ copy: "removing", actions: { ...makeView("ABORTED").actions, canClearCopy: false } }));
        renderWithClient(<MigrationBody view={leftBehind()} />);
        expect(screen.getByText(/Nothing on old-vps was changed/)).toBeInTheDocument();
        expect(screen.getByText(/Part of the practice copy is still on new-vps/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Remove the copy" }));
        // Nothing is deleted by the first click.
        expect(apiMock.clearMigrationCopy).not.toHaveBeenCalled();
        const dialog = await screen.findByRole("alertdialog");
        expect(within(dialog).getByText(/Real folders on new-vps are never deleted/)).toBeInTheDocument();
        expect(within(dialog).getByText(/old-vps is not touched/)).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole("button", { name: "Remove the copy" }));
        await waitFor(() => expect(apiMock.clearMigrationCopy).toHaveBeenCalledWith("m1"));
    });

    it("tells the owner when the removal fails, and keeps the action for another try", async () => {
        const { ApiRequestError } = await import("@/lib/api");
        apiMock.clearMigrationCopy.mockRejectedValue(new ApiRequestError(409, { message: "The copy is already being removed.", code: "bad_state" }));
        renderWithClient(<MigrationBody view={leftBehind()} />);
        fireEvent.click(screen.getByRole("button", { name: "Remove the copy" }));
        const dialog = await screen.findByRole("alertdialog");
        fireEvent.click(within(dialog).getByRole("button", { name: "Remove the copy" }));
        await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("The copy is already being removed."));
        expect(screen.getByRole("button", { name: "Remove the copy" })).toBeInTheDocument();
    });

    it("shows progress while the copy is being removed, and the result afterwards", () => {
        const { unmount } = renderWithClient(<MigrationBody view={leftBehind({ copy: "removing", actions: { ...makeView("ABORTED").actions, canClearCopy: false } })} />);
        expect(screen.getByText(/Removing the copy from new-vps/)).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Remove the copy" })).not.toBeInTheDocument();
        unmount();
        renderWithClient(<MigrationBody view={leftBehind({ copy: "removed", progress: { phase: "idle", message: "Cancelled", percent: 100, stepsDone: 0, stepsTotal: 0, current: null }, actions: { ...makeView("ABORTED").actions, canClearCopy: false } })} />);
        expect(screen.getByText(/The copy was removed from new-vps/)).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Remove the copy" })).not.toBeInTheDocument();
    });

    it("offers nothing to remove after a cancel that cleaned up fine", () => {
        renderWithClient(<MigrationBody view={makeView("ABORTED", { finished: true, copy: null })} />);
        expect(screen.getByText(/Nothing on old-vps was changed/)).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Remove the copy" })).not.toBeInTheDocument();
        expect(screen.queryByText(/still on new-vps/)).not.toBeInTheDocument();
    });
});

describe("the migrations home", () => {
    const server = (id: string, name: string, status = "connected") => ({ id, name, ip: "10.0.0.1", status, isLiveConnected: true, createdAt: "2026-01-01" });

    it("is locked, with the reason, when the API says migration is not on", async () => {
        const { ApiRequestError } = await import("@/lib/api");
        apiMock.getMigrations.mockRejectedValue(new ApiRequestError(403, { message: "forbidden" }));
        renderWithClient(<MigrationsHome />);
        expect(await screen.findByText("Migration isn't turned on for this organization")).toBeInTheDocument();
        expect(screen.getByText(/Only Opslin can turn it on during early access/)).toBeInTheDocument();
    });

    it("sends the owner to connect a server when there are fewer than two", async () => {
        apiMock.getMigrations.mockResolvedValue({ migrations: [] });
        apiMock.getServers.mockResolvedValue([server("a", "only-one")]);
        renderWithClient(<MigrationsHome />);
        expect(await screen.findByText("Connect one more server to move between them")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Connect a server" })).toHaveAttribute("href", "/servers/connect");
    });

    it("starts a migration from two servers and opens it", async () => {
        apiMock.getMigrations.mockResolvedValue({ migrations: [] });
        apiMock.getServers.mockResolvedValue([server("a", "old-vps"), server("b", "new-vps"), server("c", "asleep", "disconnected")]);
        apiMock.startMigration.mockResolvedValue({ id: "m9" });
        renderWithClient(<MigrationsHome />);
        const start = await screen.findByRole("button", { name: "Look at both servers" });
        expect(start).toBeDisabled();
        // Radix selects are driven through their listbox.
        fireEvent.click(screen.getByRole("combobox", { name: "Move from" }));
        fireEvent.click(await screen.findByRole("option", { name: "old-vps" }));
        fireEvent.click(screen.getByRole("combobox", { name: "Move to" }));
        expect(screen.queryByRole("option", { name: "asleep" })).not.toBeInTheDocument();
        fireEvent.click(await screen.findByRole("option", { name: "new-vps" }));
        expect(start).toBeEnabled();
        fireEvent.click(start);
        await waitFor(() => expect(apiMock.startMigration).toHaveBeenCalledWith({ sourceServerId: "a", targetServerId: "b" }));
        await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith("/migrations/m9"));
    });

    it("puts the unfinished migration first as 'In progress' with a way back in, and finished ones under 'Earlier migrations'", async () => {
        apiMock.getMigrations.mockResolvedValue({
            migrations: [
                { id: "m2", status: "CUTTING_OVER", createdAt: "2026-10-17T00:00:00Z", updatedAt: new Date().toISOString(), message: "", percent: 46, phase: "cutover", failed: false, source: { id: "a", name: "old-vps" }, target: { id: "b", name: "new-vps" } },
                { id: "m1", status: "ACCEPTED", createdAt: "2026-10-14T00:00:00Z", updatedAt: "2026-10-14T00:10:00Z", message: "", percent: 100, failed: false, source: { id: "a", name: "old-vps" }, target: { id: "b", name: "new-vps" } },
            ],
        });
        apiMock.getServers.mockResolvedValue([server("a", "old-vps"), server("b", "new-vps")]);
        renderWithClient(<MigrationsHome />);
        const current = await screen.findByLabelText("In progress");
        expect(within(current).getByText("In progress")).toBeInTheDocument();
        expect(within(current).getByText(/Switching over · 46%/)).toBeInTheDocument();
        expect(within(current).getByRole("link", { name: /Open/ })).toHaveAttribute("href", "/migrations/m2");
        const earlier = screen.getByLabelText("Earlier migrations");
        expect(within(earlier).getByRole("link", { name: /old-vps.*new-vps.*Finished/ })).toHaveAttribute("href", "/migrations/m1");
        expect(screen.getByText("Start another")).toBeInTheDocument();
    });

    it("explains the five steps and that nothing moves without approval", async () => {
        apiMock.getMigrations.mockResolvedValue({ migrations: [] });
        apiMock.getServers.mockResolvedValue([server("a", "old-vps"), server("b", "new-vps")]);
        renderWithClient(<MigrationsHome />);
        expect(await screen.findByRole("heading", { name: "Move your apps to a new server" })).toBeInTheDocument();
        expect(screen.getByText("1. Look")).toBeInTheDocument();
        expect(screen.getByText("4. Switch")).toBeInTheDocument();
        expect(await screen.findByText(/Nothing moves until you approve it/)).toBeInTheDocument();
        expect(screen.queryByLabelText("In progress")).not.toBeInTheDocument();
    });

    it("lists earlier migrations with their state", async () => {
        apiMock.getMigrations.mockResolvedValue({
            migrations: [{ id: "m1", status: "FAILED", createdAt: "2026-10-14T00:00:00Z", updatedAt: "2026-10-14T00:10:00Z", message: "", percent: 0, failed: true, source: { id: "a", name: "old-vps" }, target: { id: "b", name: "new-vps" } }],
        });
        apiMock.getServers.mockResolvedValue([server("a", "old-vps"), server("b", "new-vps")]);
        renderWithClient(<MigrationsHome />);
        const row = await screen.findByRole("link", { name: /old-vps.*new-vps.*Stopped/ });
        expect(row).toHaveAttribute("href", "/migrations/m1");
    });
});
