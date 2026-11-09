import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { DeployQuestions, choicesProblem, choicesToRequest, effectiveStorage } from "../DeployQuestions";
import type { PlanPreview } from "@/lib/deploy-route-types";

const plan = (over: Partial<PlanPreview> = {}): PlanPreview => ({
    verdict: "ready", services: [{ id: "api", role: "backend", path: "api" }],
    resources: [{ id: "postgres", kind: "postgres", usedBy: ["api"] }],
    skipped: [], steps: [{ kind: "migrate", service: "api", command: "npx prisma migrate deploy" }], persistent: [], questions: [], ...over,
});

// Doc 69 Q1: the few things Opslin cannot know are asked on the review screen, before Deploy, each with the recommended answer chosen.
describe("DeployQuestions", () => {
    it("asks nothing when the plan has no database, storage or migration", () => {
        const { container } = render(<DeployQuestions plan={plan({ resources: [], steps: [] })} value={{}} onChange={vi.fn()} />);
        expect(container.innerHTML).toBe("");
    });

    it("asks about the database and the migration with the recommended answers chosen", () => {
        render(<DeployQuestions plan={plan()} value={{}} onChange={vi.fn()} />);
        expect(screen.getByText("Database")).toBeTruthy();
        expect(screen.getByRole("radio", { name: "Create PostgreSQL on this server" })).toBeChecked();
        expect(screen.getByText("Migration")).toBeTruthy();
        expect(screen.getByRole("radio", { name: "Run npx prisma migrate deploy" })).toBeChecked();
        expect(screen.queryByText("Storage")).toBeNull();
    });

    it("reports an own database, and points to the settings box for its address", () => {
        const onChange = vi.fn();
        const { rerender } = render(<DeployQuestions plan={plan()} value={{}} onChange={onChange} />);
        fireEvent.click(screen.getByRole("radio", { name: "I have my own" }));
        expect(onChange).toHaveBeenCalledWith({ database: "own" });
        rerender(<DeployQuestions plan={plan()} value={{ database: "own" }} onChange={onChange} />);
        expect(screen.getByText(/Add its address under Optional settings/)).toBeTruthy();
    });

    it("asks about storage only when storage keys were found, and skipping is the default", () => {
        const onChange = vi.fn();
        render(<DeployQuestions plan={plan({ resources: [{ id: "postgres", kind: "postgres", usedBy: ["api"] }, { id: "object_storage", kind: "object_storage", usedBy: ["api"] }] })} value={{}} onChange={onChange} />);
        expect(screen.getByRole("radio", { name: "Skip for now" })).toBeChecked();
        fireEvent.click(screen.getByRole("radio", { name: "Use my Cloudflare R2" }));
        expect(onChange).toHaveBeenCalledWith({ storage: "r2" });
    });

    it("lets the owner skip the migration or type their own command, and shows what is wrong with an unsafe one", () => {
        const onChange = vi.fn();
        const { rerender } = render(<DeployQuestions plan={plan()} value={{}} onChange={onChange} />);
        fireEvent.click(screen.getByRole("radio", { name: "Don't run a migration" }));
        expect(onChange).toHaveBeenCalledWith({ migration: { mode: "none" } });
        fireEvent.click(screen.getByRole("radio", { name: "Use my own command" }));
        expect(onChange).toHaveBeenCalledWith({ migration: { mode: "custom", command: "" } });
        rerender(<DeployQuestions plan={plan()} value={{ migration: { mode: "custom", command: "a && b" } }} onChange={onChange} />);
        fireEvent.change(screen.getByLabelText("Migration command"), { target: { value: "node dist/migrate.js" } });
        expect(onChange).toHaveBeenLastCalledWith({ migration: { mode: "custom", command: "node dist/migrate.js" } });
        expect(screen.getByText(/Use only letters, numbers/)).toBeTruthy();
    });
});

describe("choicesToRequest and choicesProblem", () => {
    it("send nothing for the recommended answers, and only what differs otherwise", () => {
        expect(choicesToRequest({})).toBeUndefined();
        expect(choicesToRequest({ database: "create", storage: "skip", migration: { mode: "auto" } })).toBeUndefined();
        expect(choicesToRequest({ database: "own", storage: "r2", migration: { mode: "custom", command: " node dist/migrate.js " } })).toEqual({ database: "own", storage: "r2", migration: { mode: "custom", command: "node dist/migrate.js" } });
    });

    it("name the problem with a custom command that is empty or unsafe, and none otherwise", () => {
        expect(choicesProblem({})).toBeNull();
        expect(choicesProblem({ migration: { mode: "custom", command: "" } })).toMatch(/Type the migration command/);
        expect(choicesProblem({ migration: { mode: "custom", command: "a; b" } })).toMatch(/Use only letters, numbers/);
        expect(choicesProblem({ migration: { mode: "custom", command: "node dist/migrate.js" } })).toBeNull();
    });
});

// Doc 69 Q2: the settings the app reads, with what each means; the owner names the unclear ones, Opslin fills the values.
describe("DeployQuestions settings list", () => {
    const settings = [
        { key: "DB_HOST", resource: "database", role: "host", sure: true },
        { key: "DB_PASSWORD", resource: "database", role: "password", sure: true },
        { key: "POS_DB", resource: "database", role: null, sure: false },
        { key: "S3_BUCKET", resource: "storage", role: "bucket", sure: true },
        { key: "UPLOAD_KEY", resource: "storage", role: null, sure: false },
    ] as NonNullable<PlanPreview["settings"]>;
    const withStorage = (): PlanPreview => plan({ settings, resources: [{ id: "postgres", kind: "postgres", usedBy: ["api"] }, { id: "object_storage", kind: "object_storage", usedBy: ["api"] }] });

    it("lists the settings Opslin is sure about, collapsed, with what each means", () => {
        const { container } = render(<DeployQuestions plan={withStorage()} value={{}} onChange={vi.fn()} />);
        expect(screen.getByText("Settings Opslin fills (2)")).toBeTruthy();
        expect(container.querySelector("details")?.hasAttribute("open")).toBe(false);
        expect(screen.getByText("DB_HOST").closest("li")).toHaveTextContent("Host");
        expect(screen.getByText("DB_PASSWORD").closest("li")).toHaveTextContent("Password");
    });

    it("asks what an unclear setting means, and reports the owner's choice", () => {
        const onChange = vi.fn();
        render(<DeployQuestions plan={withStorage()} value={{}} onChange={onChange} />);
        fireEvent.change(screen.getByLabelText("What is POS_DB?"), { target: { value: "host" } });
        expect(onChange).toHaveBeenCalledWith({ settings: { POS_DB: "host" } });
        expect(screen.getByRole("option", { name: "Not a database setting" })).toBeTruthy();
    });

    it("shows the storage settings only after the owner chooses their R2", () => {
        const { rerender } = render(<DeployQuestions plan={withStorage()} value={{}} onChange={vi.fn()} />);
        expect(screen.queryByText("S3_BUCKET")).toBeNull();
        expect(screen.queryByLabelText("What is UPLOAD_KEY?")).toBeNull();
        rerender(<DeployQuestions plan={withStorage()} value={{ storage: "r2" }} onChange={vi.fn()} />);
        expect(screen.getByText("S3_BUCKET")).toBeTruthy();
        expect(screen.getByLabelText("What is UPLOAD_KEY?")).toBeTruthy();
    });

    it("shows no settings list for an own database: the owner fills those values", () => {
        render(<DeployQuestions plan={withStorage()} value={{ database: "own" }} onChange={vi.fn()} />);
        expect(screen.queryByText("DB_HOST")).toBeNull();
        expect(screen.queryByLabelText("What is POS_DB?")).toBeNull();
    });

    it("sends only the meanings the owner chose", () => {
        expect(choicesToRequest({ settings: { POS_DB: "host", UPLOAD_KEY: "" } })).toEqual({ settings: { POS_DB: "host" } });
        expect(choicesToRequest({ settings: { POS_DB: "" } })).toBeUndefined();
    });
});

describe("DeployQuestions remembered answers", () => {
    it("says where the chosen answers come from, only when they were remembered", () => {
        const { rerender } = render(<DeployQuestions plan={plan()} value={{ database: "own" }} onChange={vi.fn()} remembered />);
        expect(screen.getByText("Your answers from the last deploy of this project. Change any of them if you like.")).toBeTruthy();
        rerender(<DeployQuestions plan={plan()} value={{ database: "own" }} onChange={vi.fn()} />);
        expect(screen.queryByText(/from the last deploy of this project/)).toBeNull();
    });
});


// Doc 69 Q3: a plain .sql file the owner uploads is loaded into the new database; it brings the tables, so no migration runs.
describe("DeployQuestions data file", () => {
    it("sends the data file's reference and nothing else about it", () => {
        expect(choicesToRequest({ demoData: { uploadId: "u-1", filename: "demo.sql" } })).toEqual({ demoData: { uploadId: "u-1" } });
        expect(choicesToRequest({})).toBeUndefined();
    });

    it("offers a data file for PostgreSQL and MySQL, starting empty by default", () => {
        render(<DeployQuestions plan={plan()} value={{}} onChange={vi.fn()} />);
        expect(screen.getByText("Starting data")).toBeTruthy();
        expect(screen.getByRole("radio", { name: "Start empty" })).toBeChecked();
    });

    it("does not offer it for other engines or for the owner's own database", () => {
        const { rerender } = render(<DeployQuestions plan={plan({ resources: [{ id: "redis", kind: "redis", usedBy: ["api"] }] })} value={{}} onChange={vi.fn()} />);
        expect(screen.queryByText("Starting data")).toBeNull();
        rerender(<DeployQuestions plan={plan()} value={{ database: "own" }} onChange={vi.fn()} />);
        expect(screen.queryByText("Starting data")).toBeNull();
    });

    it("uploads the chosen file, keeps the reference, and says no migration runs", async () => {
        const upload = vi.spyOn(api, "uploadDemoData").mockResolvedValue({ uploadId: "u-1", sizeBytes: 9, filename: "demo.sql" });
        const onChange = vi.fn();
        render(<DeployQuestions plan={plan()} value={{}} onChange={onChange} />);
        fireEvent.click(screen.getByRole("radio", { name: "Load a .sql file" }));
        const input = screen.getByLabelText("Data file") as HTMLInputElement;
        fireEvent.change(input, { target: { files: [new File(["SELECT 1;"], "demo.sql")] } });
        await waitFor(() => expect(onChange).toHaveBeenCalled());
        expect(upload).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith({ demoData: { uploadId: "u-1", filename: "demo.sql" } });
    });

    it("hides the migration question once a file is chosen, and shows why a file was turned away", async () => {
        const { rerender } = render(<DeployQuestions plan={plan()} value={{ demoData: { uploadId: "u-1", filename: "demo.sql" } }} onChange={vi.fn()} />);
        expect(screen.queryByText("Migration")).toBeNull();
        expect(screen.getByText(/The file brings the tables/)).toBeTruthy();
        rerender(<DeployQuestions plan={plan()} value={{}} onChange={vi.fn()} />);
        vi.spyOn(api, "uploadDemoData").mockRejectedValue(new Error("The data file contains psql meta-commands"));
        fireEvent.click(screen.getByRole("radio", { name: "Load a .sql file" }));
        fireEvent.change(screen.getByLabelText("Data file"), { target: { files: [new File(["\\! ls"], "bad.sql")] } });
        expect(await screen.findByRole("alert")).toHaveTextContent(/meta-commands/);
    });
});

// A project that needs a bucket: the recommended answer follows whether Cloudflare is already signed in.
describe("DeployQuestions storage and Cloudflare sign-in", () => {
    const storagePlan = () => plan({ resources: [{ id: "object_storage", kind: "object_storage", usedBy: ["api"] }], steps: [] });

    it("recommends the bucket once Cloudflare state is known, and keeps Skip as the default while it is not", () => {
        expect(effectiveStorage({}, undefined)).toBe("skip");
        expect(effectiveStorage({}, "ready")).toBe("r2");
        expect(effectiveStorage({}, "signin")).toBe("r2");
        expect(effectiveStorage({ storage: "skip" }, "ready")).toBe("skip");
    });

    it("signed in: the bucket is chosen and no sign-in button is shown", () => {
        render(<DeployQuestions plan={storagePlan()} value={{}} cloudflare="ready" onChange={vi.fn()} />);
        expect(screen.getByRole("radio", { name: /Use my Cloudflare R2/ })).toBeChecked();
        expect(screen.queryByRole("button", { name: "Sign in with Cloudflare" })).toBeNull();
    });

    it("not signed in: the sign-in button appears under the chosen bucket, and disappears on Skip", () => {
        const { rerender } = render(<DeployQuestions plan={storagePlan()} value={{}} cloudflare="signin" onChange={vi.fn()} />);
        expect(screen.getByRole("button", { name: "Sign in with Cloudflare" })).toBeTruthy();
        rerender(<DeployQuestions plan={storagePlan()} value={{ storage: "skip" }} cloudflare="signin" onChange={vi.fn()} />);
        expect(screen.queryByRole("button", { name: "Sign in with Cloudflare" })).toBeNull();
    });
});
