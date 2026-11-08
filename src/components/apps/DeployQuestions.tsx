"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { PlanPreview } from "@/lib/deploy-route-types";

// The few things Opslin cannot know, asked on the review screen before Deploy and never during the run (doc 69 Q1). Each
// question has the recommended answer already chosen, so most people just press Deploy. Flat rows, label on top, one
// choice per line (DESIGN.md). Only what the plan found is asked: no database, storage or migration found, no question.

export type DeployChoicesValue = {
    database?: "create" | "own";
    storage?: "skip" | "r2";
    migration?: { mode: "auto" } | { mode: "none" } | { mode: "custom"; command: string };
    /** What an unclear setting means, by setting name. Empty means not answered. */
    settings?: Record<string, string>;
    /** A plain .sql file already uploaded for the new database (doc 69 Q3). Only the reference is sent with the deploy. */
    demoData?: { uploadId: string; filename: string };
};

type RequestedChoices = { database?: "own"; storage?: "r2"; migration?: { mode: "none" } | { mode: "custom"; command: string }; settings?: Record<string, string>; demoData?: { uploadId: string } };

const ROLE_LABEL: Record<string, string> = {
    host: "Host", port: "Port", name: "Database name", username: "User", password: "Password", url: "Connection URL",
    bucket: "Bucket name", accessKeyId: "Access key", secretAccessKey: "Secret key", endpoint: "Endpoint",
};
const DATABASE_ROLES = ["host", "port", "name", "username", "password", "url"];
const STORAGE_ROLES = ["bucket", "accessKeyId", "secretAccessKey", "endpoint"];

const ENGINE: Record<string, string> = { postgres: "PostgreSQL", postgres_vector: "PostgreSQL", mysql: "MySQL", mariadb: "MariaDB", mongodb: "MongoDB", redis: "Redis" };
const SAFE_COMMAND = /^[A-Za-z0-9_@./:=+ -]+$/;
const UNSAFE_MESSAGE = "Use only letters, numbers, spaces and . / : = + - _ @ in a migration command.";

/** What to send with the deploy: only the answers that differ from the recommended ones, or nothing. */
export function choicesToRequest(value: DeployChoicesValue): RequestedChoices | undefined {
    const out: RequestedChoices = {};
    if (value.demoData && value.database !== "own") out.demoData = { uploadId: value.demoData.uploadId };
    if (value.database === "own") out.database = "own";
    if (value.storage === "r2") out.storage = "r2";
    if (value.migration?.mode === "none") out.migration = { mode: "none" };
    if (value.migration?.mode === "custom") out.migration = { mode: "custom", command: value.migration.command.trim() };
    const answered = Object.entries(value.settings ?? {}).filter(([, role]) => role);
    if (answered.length > 0 && value.database !== "own") out.settings = Object.fromEntries(answered);
    return Object.keys(out).length > 0 ? out : undefined;
}

/** Why the answers cannot be sent yet, or null. */
export function choicesProblem(value: DeployChoicesValue): string | null {
    if (value.migration?.mode !== "custom") return null;
    const command = value.migration.command.trim();
    if (!command) return "Type the migration command to run.";
    if (command.length > 200 || !SAFE_COMMAND.test(command)) return UNSAFE_MESSAGE;
    return null;
}

function Choice({ name, label, checked, disabled, onSelect }: { name: string; label: string; checked: boolean; disabled?: boolean; onSelect: () => void }) {
    return (
        <label className="flex min-h-9 cursor-pointer items-center gap-2.5 text-sm text-foreground has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
            <input type="radio" name={name} checked={checked} disabled={disabled} onChange={onSelect} aria-label={label} className="size-4 accent-primary" />
            <span className="[overflow-wrap:anywhere]">{label}</span>
        </label>
    );
}

type SettingRow = NonNullable<PlanPreview["settings"]>[number];

/** The settings of one resource: the sure ones collapsed with what each means, the unclear ones with a choice. */
function SettingsList({ items, resource, value, onChange, disabled }: { items: SettingRow[]; resource: "database" | "storage"; value: DeployChoicesValue; onChange: (next: DeployChoicesValue) => void; disabled?: boolean }) {
    const sure = items.filter((item) => item.sure);
    const unsure = items.filter((item) => !item.sure);
    if (sure.length === 0 && unsure.length === 0) return null;
    const roles = resource === "database" ? DATABASE_ROLES : STORAGE_ROLES;
    return (
        <div className="mt-2 space-y-2">
            {sure.length > 0 ? (
                <details className="group rounded-lg border">
                    <summary className="flex min-h-10 cursor-pointer list-none items-center px-3 py-2 text-sm text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">Settings Opslin fills ({sure.length})</summary>
                    <ul className="divide-y border-t">
                        {sure.map((item) => (
                            <li key={item.key} className="flex min-h-10 items-center justify-between gap-3 px-3 py-2 text-sm">
                                <code className="min-w-0 truncate text-xs text-foreground">{item.key}</code>
                                <span className="shrink-0 text-muted-foreground">{ROLE_LABEL[item.role ?? ""] ?? item.role}</span>
                            </li>
                        ))}
                    </ul>
                </details>
            ) : null}
            {unsure.map((item) => (
                <div key={item.key} className="flex min-h-10 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-sm">
                    <code className="min-w-0 truncate text-xs text-foreground">{item.key}</code>
                    <select aria-label={`What is ${item.key}?`} disabled={disabled} value={value.settings?.[item.key] ?? ""} className="h-9 rounded-md border bg-background px-2 text-sm"
                        onChange={(event) => onChange({ ...value, settings: { ...value.settings, [item.key]: event.target.value } })}>
                        <option value="">What is it?</option>
                        {roles.map((role) => <option key={role} value={role}>{ROLE_LABEL[role]}</option>)}
                        <option value="none">{resource === "database" ? "Not a database setting" : "Not a storage setting"}</option>
                    </select>
                </div>
            ))}
        </div>
    );
}

export function DeployQuestions({ plan, value, onChange, disabled, remembered }: { plan: PlanPreview | null | undefined; value: DeployChoicesValue; onChange: (next: DeployChoicesValue) => void; disabled?: boolean; remembered?: boolean }) {
    if (!plan) return null;
    const engines = [...new Set(plan.resources.map((r) => ENGINE[r.kind]).filter((name): name is string => Boolean(name)))];
    const asksStorage = plan.resources.some((r) => r.kind === "object_storage");
    const migrate = plan.steps.find((s) => s.kind === "migrate");
    if (engines.length === 0 && !asksStorage && !migrate) return null;

    const database = value.database ?? "create";
    const storage = value.storage ?? "skip";
    const migration = value.migration ?? { mode: "auto" as const };
    const asksData = database === "create" && plan.resources.some((r) => r.kind === "postgres" || r.kind === "postgres_vector" || r.kind === "mysql");
    const problem = choicesProblem(value);
    const rowClass = "border-t px-4 py-3 first:border-t-0";
    const legendClass = "mb-1.5 text-sm font-medium text-foreground";

    return (
        <div className="rounded-xl border">
            {remembered ? <p className="border-b px-4 py-2.5 text-sm text-muted-foreground">Your answers from the last deploy of this project. Change any of them if you like.</p> : null}
            {engines.length > 0 ? (
                <div role="radiogroup" aria-labelledby="deploy-q-database" className={rowClass}>
                    <p id="deploy-q-database" className={legendClass}>Database</p>
                    <Choice name="deploy-database" label={`Create ${engines.join(" and ")} on this server`} checked={database === "create"} disabled={disabled} onSelect={() => onChange({ ...value, database: "create" })} />
                    <Choice name="deploy-database" label="I have my own" checked={database === "own"} disabled={disabled} onSelect={() => onChange({ ...value, database: "own" })} />
                    {database === "own" ? <p className="mt-1 text-sm text-muted-foreground">Add its address under Optional settings, in Environment variables. Opslin creates no database and runs no migration for it.</p> : (
                        <SettingsList items={(plan.settings ?? []).filter((item) => item.resource === "database")} resource="database" value={value} onChange={onChange} disabled={disabled} />
                    )}
                </div>
            ) : null}
            {asksData ? <DataFileRow value={value} onChange={onChange} disabled={disabled} rowClass={rowClass} legendClass={legendClass} /> : null}
            {asksStorage ? (
                <div role="radiogroup" aria-labelledby="deploy-q-storage" className={rowClass}>
                    <p id="deploy-q-storage" className={legendClass}>Storage</p>
                    <Choice name="deploy-storage" label="Skip for now" checked={storage === "skip"} disabled={disabled} onSelect={() => onChange({ ...value, storage: "skip" })} />
                    <Choice name="deploy-storage" label="Use my Cloudflare R2" checked={storage === "r2"} disabled={disabled} onSelect={() => onChange({ ...value, storage: "r2" })} />
                    {storage === "r2" ? <SettingsList items={(plan.settings ?? []).filter((item) => item.resource === "storage")} resource="storage" value={value} onChange={onChange} disabled={disabled} /> : null}
                </div>
            ) : null}
            {migrate && database === "create" && !(asksData && value.demoData) ? (
                <div role="radiogroup" aria-labelledby="deploy-q-migration" className={rowClass}>
                    <p id="deploy-q-migration" className={legendClass}>Migration</p>
                    <Choice name="deploy-migration" label={`Run ${migrate.command}`} checked={migration.mode === "auto"} disabled={disabled} onSelect={() => onChange({ ...value, migration: { mode: "auto" } })} />
                    <Choice name="deploy-migration" label="Don't run a migration" checked={migration.mode === "none"} disabled={disabled} onSelect={() => onChange({ ...value, migration: { mode: "none" } })} />
                    <Choice name="deploy-migration" label="Use my own command" checked={migration.mode === "custom"} disabled={disabled} onSelect={() => onChange({ ...value, migration: { mode: "custom", command: migration.mode === "custom" ? migration.command : "" } })} />
                    {migration.mode === "custom" ? (
                        <div className="mt-2">
                            <Input aria-label="Migration command" value={migration.command} disabled={disabled} placeholder="node dist/migrate.js" className="h-10"
                                onChange={(event) => onChange({ ...value, migration: { mode: "custom", command: event.target.value } })} />
                            {problem ? <p role="alert" className="mt-1.5 text-sm text-warning-text">{problem}</p> : null}
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

function DataFileRow({ value, onChange, disabled, rowClass, legendClass }: { value: DeployChoicesValue; onChange: (next: DeployChoicesValue) => void; disabled?: boolean; rowClass: string; legendClass: string }) {
    const [loadFile, setLoadFile] = useState(Boolean(value.demoData));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const chosen = loadFile || Boolean(value.demoData);

    const pick = async (file: File | undefined) => {
        if (!file) return;
        setBusy(true); setError(null);
        try {
            const uploaded = await api.uploadDemoData(file);
            onChange({ ...value, demoData: { uploadId: uploaded.uploadId, filename: uploaded.filename } });
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "The file could not be uploaded.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div role="radiogroup" aria-labelledby="deploy-q-data" className={rowClass}>
            <p id="deploy-q-data" className={legendClass}>Starting data</p>
            <Choice name="deploy-data" label="Start empty" checked={!chosen} disabled={disabled} onSelect={() => { setLoadFile(false); setError(null); const { demoData: _removed, ...rest } = value; onChange(rest); }} />
            <Choice name="deploy-data" label="Load a .sql file" checked={chosen} disabled={disabled} onSelect={() => setLoadFile(true)} />
            {chosen ? (
                <div className="mt-2">
                    <Input type="file" accept=".sql" aria-label="Data file" disabled={disabled || busy} className="h-10" onChange={(event) => void pick(event.target.files?.[0])} />
                    {busy ? <p className="mt-1.5 text-sm text-muted-foreground">Uploading…</p> : null}
                    {value.demoData && !busy ? <p className="mt-1.5 text-sm text-muted-foreground [overflow-wrap:anywhere]">{value.demoData.filename} is ready. The file brings the tables, so no migration runs. It is loaded into the new, empty database only.</p> : null}
                    {error ? <p role="alert" className="mt-1.5 text-sm text-warning-text">{error}</p> : null}
                </div>
            ) : null}
        </div>
    );
}
