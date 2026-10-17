import { describe, expect, it } from "vitest";
import type { MigrationPlan, PlanItem } from "@/lib/migration-types";
import { migrationRefetchInterval } from "@/hooks/use-migrations";
import type { MigrationView } from "@/lib/migration-types";
import { formatBytes, formatRange, itemDetail, movingLine, pauseLine, plural, STATUS_LABEL, statusTone, summarizePlan } from "./format";

const item = (over: Partial<PlanItem>): PlanItem => ({
    key: "k", kind: "container", label: "x", disposition: "move", dependsOn: [], needsAck: false, ...over,
});

const plan = (items: PlanItem[]): MigrationPlan => ({
    version: 1, generatedAt: "2026-10-15T00:00:00Z", factsHash: "h", items, copyOrder: [], startOrder: [], checks: [], domains: [],
    estimate: { prepareSec: { min: 60, max: 600 }, writePauseSec: { min: 60, max: 300 }, copyBytes: 1_500_000_000, assumptions: [] },
    summary: { move: items.length, manual: 0, blocked: 0, skip: 0, copyBytes: 1_500_000_000 }, needsAck: [], risks: [], ready: true, notReadyReasons: [],
});

describe("formatBytes", () => {
    it.each([[0, "0 B"], [999, "999 B"], [1500, "1.5 KB"], [1_500_000_000, "1.5 GB"], [250_000_000_000, "250 GB"]])("%s -> %s", (n, out) => {
        expect(formatBytes(n)).toBe(out);
    });
    it("does not pretend to know a bad size", () => {
        expect(formatBytes(NaN)).toBe("unknown size");
        expect(formatBytes(-1)).toBe("unknown size");
    });
});

describe("formatRange", () => {
    it("gives a range, never a single promise", () => {
        expect(formatRange({ min: 180, max: 480 })).toBe("about 3 to 8 minutes");
    });
    it("says so when it is short", () => {
        expect(formatRange({ min: 5, max: 30 })).toBe("under a minute");
    });
    it("collapses a range that rounds to one number", () => {
        expect(formatRange({ min: 290, max: 310 })).toBe("about 5 minutes");
    });
    it("switches to hours when it is long", () => {
        expect(formatRange({ min: 3600, max: 7200 })).toBe("about 1 hour to 2 hours");
    });
});

describe("copy", () => {
    it("has plain wording for every status", () => {
        for (const label of Object.values(STATUS_LABEL)) {
            expect(label).toMatch(/^[A-Z][a-z]/);
            expect(label).not.toMatch(/[A-Z_]{4,}/); // no ALL_CAPS status ids
            expect(label).not.toMatch(/docker|container|json|\bjob\b/i);
        }
    });
    it("keeps failure red for failures only", () => {
        expect(statusTone("FAILED")).toBe("failed");
        expect(statusTone("RECOVERY_REQUIRED")).toBe("attention");
        expect(statusTone("ABORTED")).toBe("neutral");
        expect(statusTone("OBSERVING")).toBe("good");
    });
    it("pluralizes", () => {
        expect(plural(1, "app")).toBe("1 app");
        expect(plural(2, "web address", "web addresses")).toBe("2 web addresses");
    });
});

describe("summarizePlan", () => {
    const items = [
        item({ key: "a", kind: "container", label: "api" }),
        item({ key: "b", kind: "container", label: "web" }),
        item({ key: "c", kind: "database", label: "pg", bytes: 2_000_000, detail: { engine: "postgresql", version: "16-alpine" } }),
        item({ key: "d", kind: "volume", label: "uploads", bytes: 5000 }),
        item({ key: "e", kind: "volume", label: "pgdata", method: "create-empty", bytes: 0 }),
        item({ key: "f", kind: "bind", label: "/srv/html", bytes: 100 }),
        item({ key: "g", kind: "site", label: "shop.example.com" }),
        item({ key: "h", kind: "manual", label: "legacy.service", disposition: "manual", needsAck: true, reason: "x" }),
    ];
    it("counts what moves in the words an owner uses", () => {
        const s = summarizePlan(plan(items));
        expect(s).toMatchObject({ apps: 2, databases: 1, files: 2, addresses: 1 });
        expect(movingLine(s)).toBe("2 apps, 1 database, 2 folders, 1 web address");
        expect(s.behind.map((i) => i.key)).toEqual(["h"]);
    });
    it("does not count a volume that is only refilled from a database as a folder", () => {
        expect(summarizePlan(plan([item({ kind: "volume", method: "create-empty" })])).files).toBe(0);
    });
    it("describes items without tool names", () => {
        expect(itemDetail(items[2]!)).toBe("PostgreSQL 16 · 2.0 MB");
        expect(itemDetail(items[4]!)).toBe("Filled from the database");
        expect(itemDetail(items[3]!)).toBe("5.0 KB");
    });
    it("says when there is nothing to move", () => {
        expect(movingLine(summarizePlan(plan([])))).toBe("Nothing yet");
    });
});

describe("pauseLine", () => {
    it("is an estimate before the practice copy and a measurement after it", () => {
        const p = plan([]);
        expect(pauseLine({ plan: p, measured: null })).toMatch(/an estimate$/);
        expect(pauseLine({ plan: p, measured: { bytesPerSec: 5_000_000, finalCopySec: 300 } })).toMatch(/from the speed of your practice copy$/);
        expect(pauseLine({ plan: null, measured: null })).toBeNull();
    });
});

describe("itemDetail for a folder inside another copied folder", () => {
    it("says where it travels instead of showing a size of 0", () => {
        const covered = item({ kind: "bind", label: "/srv/app/config/my.cnf", method: "covered", bytes: 0, detail: { coveredBy: "/srv/app/config" } });
        expect(itemDetail(covered)).toBe("Inside /srv/app/config");
        expect(itemDetail(item({ kind: "bind", label: "/srv/app/config", method: "tar-bind", bytes: 1300000 }))).toBe("1.3 MB");
    });
});

describe("migrationRefetchInterval", () => {
    const view = (over: Partial<MigrationView>) => ({ status: "ROLLED_BACK", finished: true, copy: null, ...over }) as MigrationView;

    it("stops polling a finished migration", () => {
        expect(migrationRefetchInterval(view({}))).toBe(false);
        expect(migrationRefetchInterval(undefined)).toBe(false);
    });
    it("keeps polling a finished migration while its copy is being removed", () => {
        expect(migrationRefetchInterval(view({ copy: "removing" }))).not.toBe(false);
        expect(migrationRefetchInterval(view({ copy: "removed" }))).toBe(false);
    });
    it("does the same for a cancelled migration that is having its leftovers removed", () => {
        expect(migrationRefetchInterval(view({ status: "ABORTED", copy: "removing" }))).not.toBe(false);
        expect(migrationRefetchInterval(view({ status: "ABORTED", copy: "kept" }))).toBe(false);
        expect(migrationRefetchInterval(view({ status: "ABORTED", copy: "removed" }))).toBe(false);
    });
});
