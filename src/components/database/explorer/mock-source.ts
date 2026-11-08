import type {
    ColumnFilter,
    ColumnMeta,
    DatabaseInfo,
    ExplorerDataSource,
    ExplorerEngine,
    TablePage,
    TableQuery,
    TableSummary,
} from "./types";

/* ---------------------------------------------------------------------------
 * In-memory databases used for the simulation page. Nothing here talks to a
 * server: rows are generated from a seeded random source so the same table
 * always looks the same, and the source answers search / filter / sort / paging
 * exactly the way the real API does.
 * ------------------------------------------------------------------------- */

type Row = Record<string, unknown>;

function rng(seed: number) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const FIRST = ["Aarav", "Ananya", "Rohan", "Priya", "Liam", "Olivia", "Noah", "Emma", "Mateo", "Sofia", "Kenji", "Yuki", "Fatima", "Omar", "Chloe", "Lucas", "Isha", "Arjun", "Maya", "Ethan", "Zara", "Diego", "Hana", "Ravi", "Elena", "Nikhil", "Sara", "Tomás", "Leila", "Jonas"];
const LAST = ["Sharma", "Patel", "Mondal", "Khan", "Smith", "Garcia", "Müller", "Tanaka", "Silva", "Rossi", "Ivanov", "Kim", "Nguyen", "Brown", "Das", "Reddy", "Ali", "Costa", "Dubois", "Novak"];
const DOMAINS = ["gmail.com", "outlook.com", "proton.me", "acme.io", "northwind.dev", "fastmail.com", "company.co"];
const CITIES = ["Mumbai", "Kolkata", "Berlin", "Austin", "Lisbon", "Tokyo", "Toronto", "São Paulo", "Singapore", "Amsterdam", "Nairobi", "Seoul"];
const PRODUCTS = ["Canvas Tote", "Ceramic Mug", "Linen Shirt", "Trail Sneakers", "Desk Lamp", "Notebook A5", "Steel Bottle", "Wool Beanie", "Yoga Mat", "Phone Stand", "Leather Wallet", "Wireless Charger", "Cotton Hoodie", "Travel Pouch"];
const STATUS_ORDER = ["paid", "paid", "paid", "shipped", "delivered", "delivered", "pending", "refunded", "cancelled"];
const PLANS = ["free", "starter", "pro", "pro", "team", "enterprise"];
const TOPICS = ["billing", "deploys", "databases", "onboarding", "security", "domains", "backups", "monitoring"];
const TITLES = ["How to roll back a failed release", "Connecting a custom domain with Cloudflare", "Restoring a database from a backup", "Understanding firewall rules", "Setting environment variables safely", "Zero-downtime deploys explained", "Scaling a Node.js service on one VPS", "Reading the server health graphs", "Rotating database passwords", "Why SSL renewal failed"];

const pick = <T,>(r: () => number, list: T[]): T => list[Math.floor(r() * list.length)];
const hex = (r: () => number, n: number) => Array.from({ length: n }, () => Math.floor(r() * 16).toString(16)).join("");
const uuid = (r: () => number) => `${hex(r, 8)}-${hex(r, 4)}-4${hex(r, 3)}-${pick(r, ["8", "9", "a", "b"])}${hex(r, 3)}-${hex(r, 12)}`;
const BASE_TIME = Date.UTC(2026, 10, 6, 9, 30, 0);
const iso = (ms: number) => new Date(ms).toISOString();
const daysAgo = (r: () => number, max: number) => BASE_TIME - Math.floor(r() * max * 86_400_000);
const round2 = (n: number) => Math.round(n * 100) / 100;

interface MockTable {
    name: string;
    kind: "table" | "collection";
    columns: ColumnMeta[];
    count: number;
    sizePerRow: number;
    build: (i: number) => Row;
}

const col = (name: string, type: string, kind: ColumnMeta["kind"], extra: Partial<ColumnMeta> = {}): ColumnMeta => ({ name, type, kind, ...extra });

/* ----------------------------- PostgreSQL ------------------------------- */

function pgTables(): MockTable[] {
    return [
        {
            name: "users",
            kind: "table",
            count: 12_480,
            sizePerRow: 310,
            columns: [
                col("id", "uuid", "uuid", { primaryKey: true }),
                col("full_name", "text", "text"),
                col("email", "varchar(255)", "text"),
                col("plan", "text", "text"),
                col("city", "text", "text"),
                col("is_verified", "boolean", "boolean"),
                col("orders_count", "integer", "number"),
                col("preferences", "jsonb", "json", { nullable: true }),
                col("last_seen_at", "timestamptz", "datetime", { nullable: true }),
                col("created_at", "timestamptz", "datetime"),
            ],
            build: (i) => {
                const r = rng(1000 + i);
                const first = pick(r, FIRST);
                const last = pick(r, LAST);
                return {
                    id: uuid(r),
                    full_name: `${first} ${last}`,
                    email: `${first}.${last}${Math.floor(r() * 90)}@${pick(r, DOMAINS)}`.toLowerCase(),
                    plan: pick(r, PLANS),
                    city: pick(r, CITIES),
                    is_verified: r() > 0.18,
                    orders_count: Math.floor(r() ** 2 * 40),
                    preferences: r() > 0.25 ? { theme: pick(r, ["light", "dark", "system"]), newsletter: r() > 0.5, locale: pick(r, ["en", "de", "ja", "pt-BR"]) } : null,
                    last_seen_at: r() > 0.1 ? iso(daysAgo(r, 30)) : null,
                    created_at: iso(daysAgo(r, 700)),
                };
            },
        },
        {
            name: "orders",
            kind: "table",
            count: 24_960,
            sizePerRow: 190,
            columns: [
                col("id", "bigint", "number", { primaryKey: true }),
                col("user_id", "uuid", "uuid"),
                col("status", "text", "text"),
                col("total_amount", "numeric(10,2)", "number"),
                col("currency", "char(3)", "text"),
                col("items", "integer", "number"),
                col("shipping_address", "jsonb", "json"),
                col("paid", "boolean", "boolean"),
                col("created_at", "timestamptz", "datetime"),
            ],
            build: (i) => {
                const r = rng(5000 + i);
                const status = pick(r, STATUS_ORDER);
                return {
                    id: 100_000 + i,
                    user_id: uuid(r),
                    status,
                    total_amount: round2(8 + r() ** 1.6 * 480),
                    currency: pick(r, ["USD", "USD", "EUR", "INR", "GBP"]),
                    items: 1 + Math.floor(r() * 6),
                    shipping_address: { city: pick(r, CITIES), zip: String(10000 + Math.floor(r() * 89999)), country: pick(r, ["US", "IN", "DE", "JP", "BR"]) },
                    paid: status !== "pending" && status !== "cancelled",
                    created_at: iso(daysAgo(r, 400)),
                };
            },
        },
        {
            name: "products",
            kind: "table",
            count: 1_204,
            sizePerRow: 260,
            columns: [
                col("sku", "varchar(32)", "text", { primaryKey: true }),
                col("name", "text", "text"),
                col("price", "numeric(8,2)", "number"),
                col("stock", "integer", "number"),
                col("active", "boolean", "boolean"),
                col("tags", "text[]", "json"),
                col("updated_at", "timestamptz", "datetime"),
            ],
            build: (i) => {
                const r = rng(9000 + i);
                return {
                    sku: `SKU-${String(10000 + i).padStart(6, "0")}`,
                    name: `${pick(r, PRODUCTS)} ${pick(r, ["Mini", "Classic", "Pro", "XL", "Lite", "Studio"])}`,
                    price: round2(4 + r() * 180),
                    stock: Math.floor(r() ** 2 * 900),
                    active: r() > 0.12,
                    tags: [pick(r, ["new", "sale", "bestseller", "eco"]), pick(r, ["home", "travel", "office", "outdoor"])],
                    updated_at: iso(daysAgo(r, 90)),
                };
            },
        },
        {
            name: "sessions",
            kind: "table",
            count: 8_000,
            sizePerRow: 150,
            columns: [
                col("id", "uuid", "uuid", { primaryKey: true }),
                col("user_id", "uuid", "uuid"),
                col("ip", "inet", "other"),
                col("user_agent", "text", "text"),
                col("expires_at", "timestamptz", "datetime"),
            ],
            build: (i) => {
                const r = rng(14000 + i);
                return {
                    id: uuid(r),
                    user_id: uuid(r),
                    ip: `${10 + Math.floor(r() * 200)}.${Math.floor(r() * 255)}.${Math.floor(r() * 255)}.${1 + Math.floor(r() * 253)}`,
                    user_agent: pick(r, ["Mozilla/5.0 (Macintosh) Chrome/131", "Mozilla/5.0 (iPhone) Safari/18", "Mozilla/5.0 (X11; Linux) Firefox/133", "curl/8.7.1"]),
                    expires_at: iso(BASE_TIME + Math.floor(r() * 14 * 86_400_000)),
                };
            },
        },
        {
            name: "audit_log",
            kind: "table",
            count: 15_300,
            sizePerRow: 220,
            columns: [
                col("id", "bigserial", "number", { primaryKey: true }),
                col("actor", "text", "text"),
                col("action", "text", "text"),
                col("target", "text", "text"),
                col("metadata", "jsonb", "json", { nullable: true }),
                col("at", "timestamptz", "datetime"),
            ],
            build: (i) => {
                const r = rng(20000 + i);
                return {
                    id: i + 1,
                    actor: `${pick(r, FIRST).toLowerCase()}@${pick(r, DOMAINS)}`,
                    action: pick(r, ["user.login", "order.refund", "product.update", "user.invite", "plan.change", "export.create"]),
                    target: `${pick(r, ["order", "user", "product"])}:${Math.floor(r() * 90000)}`,
                    metadata: r() > 0.4 ? { ip: `10.0.${Math.floor(r() * 255)}.${Math.floor(r() * 255)}`, source: pick(r, ["web", "api", "cli"]) } : null,
                    at: iso(daysAgo(r, 60)),
                };
            },
        },
    ];
}

/* ------------------------------- pgvector -------------------------------- */

const VECTOR_DIMS = 384;
function embedding(seed: number): number[] {
    const r = rng(seed);
    return Array.from({ length: VECTOR_DIMS }, () => Math.round((r() * 2 - 1) * 1000) / 1000);
}

function vectorTables(): MockTable[] {
    return [
        {
            name: "documents",
            kind: "table",
            count: 9_600,
            sizePerRow: 1_980,
            columns: [
                col("id", "bigint", "number", { primaryKey: true }),
                col("title", "text", "text"),
                col("topic", "text", "text"),
                col("source_url", "text", "text"),
                col("token_count", "integer", "number"),
                col("embedding", `vector(${VECTOR_DIMS})`, "vector"),
                col("indexed_at", "timestamptz", "datetime"),
            ],
            build: (i) => {
                const r = rng(31000 + i);
                const topic = pick(r, TOPICS);
                return {
                    id: i + 1,
                    title: pick(r, TITLES),
                    topic,
                    source_url: `https://docs.example.com/${topic}/${hex(r, 6)}`,
                    token_count: 80 + Math.floor(r() * 1900),
                    embedding: embedding(31000 + i),
                    indexed_at: iso(daysAgo(r, 120)),
                };
            },
        },
        {
            name: "chat_messages",
            kind: "table",
            count: 4_200,
            sizePerRow: 2_100,
            columns: [
                col("id", "uuid", "uuid", { primaryKey: true }),
                col("conversation_id", "uuid", "uuid"),
                col("role", "text", "text"),
                col("content", "text", "text"),
                col("embedding", `vector(${VECTOR_DIMS})`, "vector", { nullable: true }),
                col("created_at", "timestamptz", "datetime"),
            ],
            build: (i) => {
                const r = rng(41000 + i);
                return {
                    id: uuid(r),
                    conversation_id: uuid(r),
                    role: pick(r, ["user", "assistant", "assistant", "system"]),
                    content: pick(r, ["How do I restore last night's backup?", "Your restore finished in 42 seconds.", "Why is my deploy stuck on health checks?", "Open ports are listed under Firewall.", "Can you point my domain to this server?"]),
                    embedding: r() > 0.15 ? embedding(41000 + i) : null,
                    created_at: iso(daysAgo(r, 45)),
                };
            },
        },
        ...pgTables().slice(0, 1),
    ];
}

/* -------------------------------- MySQL --------------------------------- */

function mysqlTables(): MockTable[] {
    return [
        {
            name: "customers",
            kind: "table",
            count: 6_840,
            sizePerRow: 240,
            columns: [
                col("id", "int unsigned", "number", { primaryKey: true }),
                col("name", "varchar(120)", "text"),
                col("email", "varchar(190)", "text"),
                col("country", "char(2)", "text"),
                col("is_active", "tinyint(1)", "boolean"),
                col("credit_limit", "decimal(10,2)", "number"),
                col("created_at", "datetime", "datetime"),
            ],
            build: (i) => {
                const r = rng(61000 + i);
                const first = pick(r, FIRST);
                const last = pick(r, LAST);
                return {
                    id: i + 1,
                    name: `${first} ${last}`,
                    email: `${first}.${last}@${pick(r, DOMAINS)}`.toLowerCase(),
                    country: pick(r, ["US", "IN", "DE", "JP", "BR", "GB"]),
                    is_active: r() > 0.15,
                    credit_limit: round2(r() * 5000),
                    created_at: iso(daysAgo(r, 900)),
                };
            },
        },
        {
            name: "invoices",
            kind: "table",
            count: 18_420,
            sizePerRow: 170,
            columns: [
                col("id", "int unsigned", "number", { primaryKey: true }),
                col("customer_id", "int unsigned", "number"),
                col("number", "varchar(24)", "text"),
                col("amount", "decimal(10,2)", "number"),
                col("status", "enum('draft','sent','paid','void')", "text"),
                col("due_date", "date", "datetime"),
                col("paid_at", "datetime", "datetime", { nullable: true }),
            ],
            build: (i) => {
                const r = rng(71000 + i);
                const status = pick(r, ["paid", "paid", "paid", "sent", "draft", "void"]);
                return {
                    id: i + 1,
                    customer_id: 1 + Math.floor(r() * 6840),
                    number: `INV-${String(2024000 + i)}`,
                    amount: round2(20 + r() ** 1.5 * 3200),
                    status,
                    due_date: iso(daysAgo(r, 300)).slice(0, 10),
                    paid_at: status === "paid" ? iso(daysAgo(r, 280)) : null,
                };
            },
        },
        {
            name: "line_items",
            kind: "table",
            count: 40_000,
            sizePerRow: 96,
            columns: [
                col("id", "int unsigned", "number", { primaryKey: true }),
                col("invoice_id", "int unsigned", "number"),
                col("description", "varchar(255)", "text"),
                col("quantity", "int", "number"),
                col("unit_price", "decimal(10,2)", "number"),
            ],
            build: (i) => {
                const r = rng(81000 + i);
                return { id: i + 1, invoice_id: 1 + Math.floor(r() * 18420), description: pick(r, PRODUCTS), quantity: 1 + Math.floor(r() * 12), unit_price: round2(2 + r() * 240) };
            },
        },
    ];
}

/* ------------------------------- MongoDB -------------------------------- */

function mongoTables(): MockTable[] {
    const oid = (r: () => number) => hex(r, 24);
    return [
        {
            name: "events",
            kind: "collection",
            count: 22_000,
            sizePerRow: 420,
            columns: [
                col("_id", "ObjectId", "id", { primaryKey: true }),
                col("type", "string", "text"),
                col("userId", "ObjectId", "id"),
                col("properties", "object", "json"),
                col("tags", "array", "json"),
                col("timestamp", "date", "datetime"),
            ],
            build: (i) => {
                const r = rng(91000 + i);
                const type = pick(r, ["page_view", "page_view", "signup", "purchase", "deploy_started", "login"]);
                return {
                    _id: oid(r),
                    type,
                    userId: oid(r),
                    properties: type === "purchase" ? { amount: round2(5 + r() * 300), currency: "USD", items: 1 + Math.floor(r() * 5) } : { path: pick(r, ["/", "/pricing", "/docs", "/dashboard", "/servers"]), referrer: pick(r, ["google", "direct", "twitter", "newsletter"]) },
                    tags: r() > 0.5 ? [pick(r, ["mobile", "desktop"]), pick(r, ["eu", "us", "apac"])] : [],
                    timestamp: iso(daysAgo(r, 30)),
                };
            },
        },
        {
            name: "users",
            kind: "collection",
            count: 5_400,
            sizePerRow: 380,
            columns: [
                col("_id", "ObjectId", "id", { primaryKey: true }),
                col("name", "string", "text"),
                col("email", "string", "text"),
                col("profile", "object", "json"),
                col("verified", "bool", "boolean"),
                col("createdAt", "date", "datetime"),
            ],
            build: (i) => {
                const r = rng(95000 + i);
                const first = pick(r, FIRST);
                const last = pick(r, LAST);
                return {
                    _id: oid(r),
                    name: `${first} ${last}`,
                    email: `${first}.${last}@${pick(r, DOMAINS)}`.toLowerCase(),
                    profile: { city: pick(r, CITIES), plan: pick(r, PLANS), interests: [pick(r, TOPICS), pick(r, TOPICS)] },
                    verified: r() > 0.2,
                    createdAt: iso(daysAgo(r, 600)),
                };
            },
        },
        {
            name: "carts",
            kind: "collection",
            count: 2_100,
            sizePerRow: 300,
            columns: [
                col("_id", "ObjectId", "id", { primaryKey: true }),
                col("userId", "ObjectId", "id"),
                col("lines", "array", "json"),
                col("total", "double", "number"),
                col("abandoned", "bool", "boolean"),
                col("updatedAt", "date", "datetime"),
            ],
            build: (i) => {
                const r = rng(99000 + i);
                const lines = Array.from({ length: 1 + Math.floor(r() * 4) }, () => ({ sku: `SKU-${10000 + Math.floor(r() * 1204)}`, qty: 1 + Math.floor(r() * 3) }));
                return { _id: oid(r), userId: oid(r), lines, total: round2(10 + r() * 400), abandoned: r() > 0.6, updatedAt: iso(daysAgo(r, 20)) };
            },
        },
    ];
}

/* --------------------------- the query engine --------------------------- */

function matchesFilter(row: Row, f: ColumnFilter, kind: ColumnMeta["kind"]): boolean {
    const v = row[f.column];
    if (f.op === "is_null") return v === null || v === undefined;
    if (f.op === "not_null") return v !== null && v !== undefined;
    if (v === null || v === undefined) return false;
    const raw = f.value.trim();
    if (kind === "number") {
        const n = Number(raw);
        const x = Number(v);
        if (!Number.isFinite(n)) return false;
        switch (f.op) {
            case "equals": return x === n;
            case "not_equals": return x !== n;
            case "gt": return x > n;
            case "gte": return x >= n;
            case "lt": return x < n;
            case "lte": return x <= n;
        }
    }
    if (kind === "datetime") {
        const t = new Date(String(v)).getTime();
        const target = new Date(raw).getTime();
        if (Number.isNaN(target)) return false;
        const dayEnd = target + 86_400_000;
        switch (f.op) {
            case "gt": return t >= dayEnd;
            case "gte": return t >= target;
            case "lt": return t < target;
            case "lte": return t < dayEnd;
            case "equals": return t >= target && t < dayEnd;
        }
    }
    if (kind === "boolean") return String(v) === raw;
    const hay = (typeof v === "object" ? JSON.stringify(v) : String(v)).toLowerCase();
    const needle = raw.toLowerCase();
    switch (f.op) {
        case "contains": return hay.includes(needle);
        case "equals": return hay === needle;
        case "not_equals": return hay !== needle;
    }
    return true;
}

function compare(a: unknown, b: unknown): number {
    if (a === b) return 0;
    if (a === null || a === undefined) return 1;
    if (b === null || b === undefined) return -1;
    if (typeof a === "number" && typeof b === "number") return a - b;
    return String(a).localeCompare(String(b), undefined, { numeric: true });
}

function createSource(opts: { id: string; engine: ExplorerEngine; name: string; readOnly: boolean; version: string; charset: string; extensions?: string[]; tables: MockTable[]; latency?: number }): ExplorerDataSource {
    const cache = new Map<string, Row[]>();
    const rowsOf = (t: MockTable): Row[] => {
        let rows = cache.get(t.name);
        if (!rows) {
            rows = Array.from({ length: t.count }, (_, i) => t.build(i));
            cache.set(t.name, rows);
        }
        return rows;
    };
    const wait = (extra = 0) => new Promise<void>((resolve) => setTimeout(resolve, (opts.latency ?? 160) + extra + Math.random() * 120));
    const summaries = (): TableSummary[] =>
        opts.tables.map((t) => ({ name: t.name, kind: t.kind, rows: t.count, sizeBytes: t.count * t.sizePerRow, columns: t.columns.length }));

    return {
        id: opts.id,
        engine: opts.engine,
        name: opts.name,
        readOnly: opts.readOnly,
        async getInfo(): Promise<DatabaseInfo> {
            await wait();
            const s = summaries();
            const size = s.reduce((n, t) => n + (t.sizeBytes ?? 0), 0);
            return {
                version: opts.version,
                sizeBytes: size,
                tableCount: s.length,
                rowCount: s.reduce((n, t) => n + (t.rows ?? 0), 0),
                connections: { active: 7, max: 100 },
                uptimeSeconds: 19 * 86_400 + 4 * 3600,
                charset: opts.charset,
                extensions: opts.extensions,
            };
        },
        async listTables() {
            await wait();
            return summaries();
        },
        async getTablePage(tableName: string, q: TableQuery): Promise<TablePage> {
            const started = performance.now();
            const t = opts.tables.find((x) => x.name === tableName);
            if (!t) throw new Error(`No ${opts.engine === "mongodb" ? "collection" : "table"} called ${tableName}.`);
            await wait(t.count > 20_000 ? 120 : 0);

            let rows = rowsOf(t);
            const kinds = new Map(t.columns.map((c) => [c.name, c.kind] as const));
            for (const f of q.filters) rows = rows.filter((r) => matchesFilter(r, f, kinds.get(f.column) ?? "text"));
            if (q.search) {
                const needle = q.search.toLowerCase();
                const searchable = t.columns.filter((c) => c.kind === "text" || c.kind === "id" || c.kind === "uuid" || c.kind === "other" || c.kind === "number");
                rows = rows.filter((r) => searchable.some((c) => String(r[c.name] ?? "").toLowerCase().includes(needle)));
            }
            if (q.sort) {
                const { column, direction } = q.sort;
                const dir = direction === "asc" ? 1 : -1;
                rows = [...rows].sort((a, b) => {
                    const av = a[column];
                    const bv = b[column];
                    // Nulls always sink to the bottom, like the real queries do.
                    if ((av === null || av === undefined) !== (bv === null || bv === undefined)) return compare(av, bv);
                    return compare(av, bv) * dir;
                });
            }
            const total = rows.length;
            const slice = rows.slice(q.page * q.pageSize, (q.page + 1) * q.pageSize);
            return { columns: t.columns, rows: slice, totalCount: total, elapsedMs: Math.round(performance.now() - started) };
        },
    };
}

export type DemoEngineKey = "postgresql" | "pgvector" | "mysql" | "mongodb";

export function createDemoSource(key: DemoEngineKey): ExplorerDataSource {
    switch (key) {
        case "postgresql":
            return createSource({ id: "demo-pg", engine: "postgresql", name: "shop_prod", readOnly: false, version: "PostgreSQL 16.4", charset: "UTF8", tables: pgTables() });
        case "pgvector":
            return createSource({ id: "demo-pgv", engine: "postgresql_vector", name: "knowledge_base", readOnly: false, version: "PostgreSQL 16.4", charset: "UTF8", extensions: ["vector 0.8.0", "pg_trgm", "uuid-ossp"], tables: vectorTables() });
        case "mysql":
            return createSource({ id: "demo-mysql", engine: "mysql", name: "billing", readOnly: true, version: "MySQL 8.4.2", charset: "utf8mb4", tables: mysqlTables() });
        case "mongodb":
            return createSource({ id: "demo-mongo", engine: "mongodb", name: "analytics", readOnly: false, version: "MongoDB 7.0.14", charset: "UTF-8", tables: mongoTables() });
    }
}
