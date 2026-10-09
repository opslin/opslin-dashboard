import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/api";
import {
    buildConnectionString,
    buildEnvVarsForDatabase,
    credentialFieldsForDatabase,
    databaseHasNoPassword,
} from "@/lib/db-connection";

const redis = (over: Partial<Database> = {}): Database => ({
    id: "db-1", name: "cache", type: "redis", status: "running", hostPort: 20001, createdAt: "2026-01-01T00:00:00.000Z", ...over,
});

describe("Redis connection strings", () => {
    it("a legacy Redis without a password (authRequired false/absent) gets no credentials in the URL", () => {
        expect(buildConnectionString(redis(), "host.docker.internal", "ignored")).toBe("redis://host.docker.internal:20001");
        expect(buildConnectionString(redis({ authRequired: false }), "localhost", "ignored")).toBe("redis://localhost:20001");
    });

    it("a Redis that requires a password uses a password-only URL", () => {
        const db = redis({ authRequired: true });
        expect(buildConnectionString(db, "host.docker.internal", "s3cret")).toBe("redis://:s3cret@host.docker.internal:20001");
    });

    it("URL-encodes special characters so the password cannot break the URL", () => {
        const db = redis({ authRequired: true });
        const url = buildConnectionString(db, "localhost", "p@ss:w/rd#?%!'()*");
        expect(url).toBe("redis://:p%40ss%3Aw%2Frd%23%3F%25%21%27%28%29%2A@localhost:20001");
        expect(new URL(url).password).toBe("p%40ss%3Aw%2Frd%23%3F%25%21%27%28%29%2A");
    });

    it("masks the password when asked, and never prints the real one", () => {
        const url = buildConnectionString(redis({ authRequired: true }), "localhost", "s3cret", { mask: true });
        expect(url).toContain("••••••••••••");
        expect(url).not.toContain("s3cret");
    });

    it("returns nothing without a published port", () => {
        expect(buildConnectionString(redis({ hostPort: null, authRequired: true }), "localhost", "x")).toBe("");
    });
});

describe("databaseHasNoPassword", () => {
    it("is true only for Redis that does not require auth", () => {
        expect(databaseHasNoPassword(redis())).toBe(true);
        expect(databaseHasNoPassword(redis({ authRequired: false }))).toBe(true);
        expect(databaseHasNoPassword(redis({ authRequired: true }))).toBe(false);
        expect(databaseHasNoPassword({ type: "postgresql", authRequired: false })).toBe(false);
        expect(databaseHasNoPassword({ type: "mysql" })).toBe(false);
    });
});

describe("env vars injected into apps", () => {
    it("new Redis: URL has the password and a REDIS_PASSWORD secret is added", () => {
        const vars = buildEnvVarsForDatabase(redis({ authRequired: true }), "s3cret", "REDIS");
        expect(vars.find((v) => v.key === "REDIS_URL")!.value).toBe("redis://:s3cret@host.docker.internal:20001");
        expect(vars.find((v) => v.key === "REDIS_PASSWORD")).toMatchObject({ value: "s3cret", isSecret: true });
    });

    it("legacy Redis: unchanged from before (no password anywhere)", () => {
        const vars = buildEnvVarsForDatabase(redis(), "ignored", "REDIS");
        expect(vars.find((v) => v.key === "REDIS_URL")!.value).toBe("redis://host.docker.internal:20001");
        expect(vars.some((v) => v.key === "REDIS_PASSWORD")).toBe(false);
        expect(credentialFieldsForDatabase(redis(), "ignored").password).toBe("");
    });

    it("other engines are unchanged", () => {
        const pg: Database = { id: "p", name: "orders", type: "postgresql", status: "running", hostPort: 20002, username: "app", createdAt: "x" };
        expect(buildConnectionString(pg, "localhost", "pw")).toBe("postgresql://app:pw@localhost:20002/orders");
        expect(credentialFieldsForDatabase(pg, "pw").password).toBe("pw");
    });
});
