import type { Database } from "@/lib/api";
import type { EnvVar } from "@/components/ui/env-vars-editor";

export const APP_CONTAINER_HOST = "host.docker.internal";
export const SERVER_LOCAL_HOST = "localhost";

export function strictEncodeURIComponent(value: string) {
    return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
        `%${char.charCodeAt(0).toString(16).toUpperCase()}`
    );
}

export function buildConnectionString(
    database: Database,
    host: string,
    password: string | null,
    options: { mask?: boolean } = {}
) {
    if (!database.hostPort) return "";
    const dbType = database.type.toLowerCase();
    const encodedDbName = strictEncodeURIComponent(database.name);
    if (dbType === "redis") return `redis://${host}:${database.hostPort}`;

    const pw = options.mask ? "••••••••••••" : (password || "••••••••••••");
    const user = database.username ? strictEncodeURIComponent(database.username) : "";
    const auth = user ? `${user}:${pw}@` : "";

    if (dbType === "mongodb") return `mongodb://${auth}${host}:${database.hostPort}/${encodedDbName}?authSource=admin`;
    if (dbType === "mysql") return `mysql://${auth}${host}:${database.hostPort}/${encodedDbName}`;
    return `postgresql://${auth}${host}:${database.hostPort}/${encodedDbName}`;
}

export function sanitizeEnvPrefix(name: string): string {
    return name.toUpperCase().replace(/[^A-Z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

/**
 * Env var name prefix per selected database, collision-free across a
 * multi-database selection (e.g. Postgres + Redis in one go).
 */
export function deriveEnvVarNames(databases: Pick<Database, "id" | "name" | "type">[]): Map<string, string> {
    const prefixes = new Map<string, string>();

    if (databases.length === 1) {
        const db = databases[0];
        prefixes.set(db.id, db.type.toLowerCase() === "redis" ? "REDIS" : "DATABASE");
        return prefixes;
    }

    const used = new Set<string>();
    for (const db of databases) {
        const base = sanitizeEnvPrefix(db.name) || (db.type.toLowerCase() === "redis" ? "REDIS" : "DATABASE");
        let candidate = base;
        let n = 2;
        while (used.has(candidate)) {
            candidate = `${base}_${n}`;
            n += 1;
        }
        used.add(candidate);
        prefixes.set(db.id, candidate);
    }
    return prefixes;
}

export interface DbCredentialFields {
    url: string;
    host: string;
    port: string;
    name: string;
    user: string;
    password: string;
}

export function credentialFieldsForDatabase(database: Database, password: string | null): DbCredentialFields {
    return {
        url: buildConnectionString(database, APP_CONTAINER_HOST, password),
        host: APP_CONTAINER_HOST,
        port: database.hostPort != null ? String(database.hostPort) : "",
        name: database.name,
        user: database.username || "",
        password: database.type.toLowerCase() === "redis" ? "" : (password || ""),
    };
}

/**
 * Builds the full set of env vars to inject for one database: always the
 * connection URL, plus split HOST/PORT/NAME/USER/PASSWORD fields (skipping
 * any field whose underlying value is empty, e.g. Redis has no username).
 */
export function buildEnvVarsForDatabase(database: Database, password: string | null, prefix: string): EnvVar[] {
    const fields = credentialFieldsForDatabase(database, password);
    const vars: EnvVar[] = [];

    if (fields.url) vars.push({ key: `${prefix}_URL`, value: fields.url, isSecret: true });
    if (fields.host) vars.push({ key: `${prefix}_HOST`, value: fields.host, isSecret: false });
    if (fields.port) vars.push({ key: `${prefix}_PORT`, value: fields.port, isSecret: false });
    if (fields.name) vars.push({ key: `${prefix}_NAME`, value: fields.name, isSecret: false });
    if (fields.user) vars.push({ key: `${prefix}_USER`, value: fields.user, isSecret: false });
    if (fields.password) vars.push({ key: `${prefix}_PASSWORD`, value: fields.password, isSecret: true });

    return vars;
}

/**
 * Resolves key collisions against an existing env var list by appending a
 * numeric suffix (_2, _3, ...) rather than silently overwriting a variable
 * the app already relies on.
 */
export function dedupeEnvVarKeys(newVars: EnvVar[], existingKeys: Set<string>): { vars: EnvVar[]; renamed: Map<string, string> } {
    const taken = new Set(existingKeys);
    const renamed = new Map<string, string>();
    const result: EnvVar[] = [];

    for (const v of newVars) {
        let key = v.key;
        if (taken.has(key)) {
            let n = 2;
            let candidate = `${v.key}_${n}`;
            while (taken.has(candidate)) {
                n += 1;
                candidate = `${v.key}_${n}`;
            }
            renamed.set(v.key, candidate);
            key = candidate;
        }
        taken.add(key);
        result.push({ ...v, key });
    }

    return { vars: result, renamed };
}
