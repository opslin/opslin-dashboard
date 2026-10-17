// Screenshots of the migration screens with the API mocked at the network layer (DESIGN.md P10).
//   node scripts/migration-shots.mjs <outDir> [scenario ...]
// Needs the dev dashboard on :3000 and Google Chrome (Playwright channel "chrome").
import { readFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const dir = fileURLToPath(new URL("../", import.meta.url));
const { chromium } = createRequire(dir)("playwright");
const OUT = process.argv[2];
if (!OUT) throw new Error("usage: migration-shots.mjs <outDir> [scenario ...]");
mkdirSync(OUT, { recursive: true });
const ONLY = new Set(process.argv.slice(3));
const BASE = "http://localhost:3000";
const apiUrl = new URL((readFileSync(`${dir}.env.local`, "utf8").match(/^NEXT_PUBLIC_API_URL=(.+)$/m) || [])[1].trim());
const now = () => new Date().toISOString();
const user = { id: "u1", email: "founder@example.com", name: "Founder", onboardingCompleted: true, emailVerified: true, createdAt: "2026-05-01T00:00:00.000Z", organizationId: "org-1", organizationName: "Opslin Test Org", organizationSlug: "t", orgRole: "OWNER", memberships: [] };
const planInfo = { plan: { slug: "free", name: "Free Beta", features: { "smi.enabled": true }, maxServers: 10, maxApps: 20, maxDatabases: 5 }, subscription: null, usage: { servers: 2, apps: 1, databases: 0 }, trial: null };
const item = (o) => ({ dependsOn: [], needsAck: false, disposition: "move", ...o });
const rich = [
  item({ key: "container:main-api", kind: "container", label: "main-api", detail: { image: "main-api:latest" } }),
  item({ key: "container:legacy-worker", kind: "container", label: "legacy-worker", disposition: "manual", needsAck: true, reason: "Needs a secret key" }),
  item({ key: "database:pg", kind: "database", label: "PostgreSQL (prod)", bytes: 12e9, detail: { engine: "postgresql", version: "16" } }),
  item({ key: "database:my", kind: "database", label: "MySQL (analytics)", bytes: 4e9, detail: { engine: "mysql", version: "8" } }),
  item({ key: "database:redis", kind: "database", label: "Redis (cache)", bytes: 1e9, disposition: "manual", needsAck: true, reason: "Needs a secret key", detail: { engine: "redis" } }),
  item({ key: "database:mongo", kind: "database", label: "MongoDB (logs)", bytes: 8e9, disposition: "blocked", needsAck: true, reason: "Points to another provider", detail: { engine: "mongodb" } }),
  item({ key: "volume:uploads", kind: "volume", label: "shop_uploads", bytes: 740e6, method: "tar-volume" }),
  item({ key: "site:shop", kind: "site", label: "shop.example.com", method: "proxy-vhost" }),
  item({ key: "manual:cron", kind: "manual", label: "/etc/cron.d/backup", disposition: "manual", needsAck: true, reason: "5 scheduled jobs. Cron jobs are not moved automatically." }),
];
const plan = { version: 1, generatedAt: now(), factsHash: "h", items: rich, copyOrder: [], startOrder: [], checks: [{ id: "target-docker", label: "Docker on the new server", status: "pass", detail: "Docker 27 is running." }, { id: "target-disk", label: "Room on the new server", status: "pass", detail: "100 GB free" }], domains: [{ names: ["shop.example.com"], tls: true, sourceFile: "x", movable: true }], estimate: { prepareSec: { min: 3600, max: 7200 }, writePauseSec: { min: 300, max: 600 }, copyBytes: 3000000000, assumptions: [] }, summary: { move: 1, manual: 0, blocked: 0, skip: 0, copyBytes: 3000000000 }, needsAck: ["container:legacy-worker", "database:redis", "database:mongo", "manual:cron"], risks: ["Writes made on the old server after the final copy starts are not carried over.", "These addresses used HTTPS on the old server. The new server serves them over plain HTTP until you add a certificate."], ready: true, notReadyReasons: [] };
const sm = (o = {}) => ({ dockerFound: true, dockerVersion: "27", apps: 10, databases: 5, engines: ["postgresql", "mysql", "redis", "mongodb"], folders: 12, websites: 2, bytes: 3000000000, usesNginx: true, empty: false, memoryMb: 4096, diskFreeMb: 30000, cpus: 2, hostname: "h", ...o });
const empty = sm({ apps: 0, databases: 0, engines: [], folders: 0, websites: 0, bytes: 0, usesNginx: false, empty: true });
const stages = (cur, status) => ["look", "plan", "practice", "switch", "live"].map((id, i) => ({ id, label: id, state: status === "ACCEPTED" ? "done" : i < cur ? "done" : i === cur ? "current" : "pending" }));
const noActions = { canConfirm: false, canEditPlan: false, canCutover: false, canAccept: false, canAbort: false, canRetry: false, canRescan: false, canRecover: false, canResume: false, canClearCopy: false, canRetryLinks: false, canCheckLinks: false };
const view = (status, cur, o = {}) => ({ id: "m1", status, createdAt: now(), updatedAt: now(), writerOwner: "source", source: { id: "s1", name: "prod-web-01", ip: "54.210.12.34", hostname: null }, target: { id: "s2", name: "staging-web-02", ip: "3.22.101.77", hostname: null },
  stages: stages(cur, status), progress: { phase: "idle", message: "", percent: 0, stepsDone: 0, stepsTotal: 0, current: null }, steps: [], failure: null, plan, planHash: "p".repeat(64), skip: [], scan: null, scanSummary: { source: sm(), target: empty }, readiness: { newServerIp: "3.22.101.77", oldServerIp: "54.210.12.34", services: [{ id: "razorpay", name: "Razorpay", kind: "payments", evidence: ["RAZORPAY_KEY_ID"], checks: ["After the switch, make one small real payment and one refund.", "In the provider's dashboard, check that the webhook address still points to your domain.", "Razorpay does not usually limit by server address; if payments are refused, look at the account's allowed settings."] }, { id: "msg91", name: "MSG91", kind: "sms", evidence: ["MSG91_AUTH_KEY"], checks: ["SMS providers in India often accept calls only from listed server addresses; add the new one before switching.", "Send one test SMS after the switch."] }, { id: "smtp", name: "Email (SMTP)", kind: "email", evidence: ["SMTP_HOST"], checks: ["Send one test email after the switch.", "If your sender record (SPF) lists the old server's address, add the new one."] }] },
  events: [], transfers: [], measured: null, verification: { rehearsal: null, final: null }, actions: noActions, apps: null, copy: null, keptFolders: [], finished: false, ...o });
var practiceSteps = [
  { id: "prepare", label: "Preparing the new server", state: "done" },
  { id: "rehearsal:copy-out:image:sha256:1", label: "Reading the image shop-api", state: "done" },
  { id: "rehearsal:copy-out:database:pg", label: "Writing the database shop-postgres-1", state: "current" },
  { id: "rehearsal:copy-out:volume:uploads", label: "Reading the volume shop_uploads", state: "pending" },
  { id: "rehearsal:check", label: "Checking the practice copy works", state: "pending" },
];
const finding = (id, level, title, detail, fix) => ({ id, level, title, detail, fix });
const rep = (findings, problems, warnings) => ({ checkedAt: now(), url: "https://shop-x7k2.agnixstudio.in/", reached: true, status: 200, findings, summary: { problems, warnings }, disclaimer: "q", notChecked: ["Signing in, and anything after you are signed in", "Payments, e-mails and other things that call your site from outside"] });
const liveApps = [
  { key: "a", label: "Shopfront", names: ["shop.example.com"], container: "web", port: 8080, appId: "app-1", domain: "shop-x7k2.agnixstudio.in", url: "https://shop-x7k2.agnixstudio.in", state: "ready", note: null, updatedAt: now(), precheck: rep([
    finding("cookie-domain", "problem", "Login cookies are for your old domain", "People may need to sign in again because cookies were made for the old address.", "Update your cookie domain setting to your real domain."),
    finding("host-check", "problem", "The project refuses this host name", "Django only accepts the names it was set up with.", "Add shop-x7k2.agnixstudio.in to ALLOWED_HOSTS."),
    finding("old-links", "warning", "The page mentions your old address", "shop.example.com appears in the page.", "Expected until your domain points here.")], 2, 1) },
  { key: "b", label: "Blog", names: ["blog.example.com"], container: "blog", port: 8081, appId: "app-2", domain: "blog-m4p9.agnixstudio.in", url: "https://blog-m4p9.agnixstudio.in", state: "ready", note: null, updatedAt: now(), precheck: rep([finding("cors", "problem", "Calls are allowed only from another address", "x", "Add the address to the allowed origins.")], 1, 0) },
  { key: "c", label: "Admin", names: ["admin.example.com"], container: "admin", port: 8082, appId: "app-3", domain: "admin-r8n3.agnixstudio.in", url: "https://admin-r8n3.agnixstudio.in", state: "ready", note: null, updatedAt: now(), precheck: rep([{ id: "opens", level: "ok", title: "The home page opens", detail: "ok" }], 0, 0) },
];
const swSteps = [
  { id: "cutover:rescan", label: "Checking nothing changed", state: "done" }, { id: "cutover:fence", label: "Stopping", state: "done" }, { id: "cutover:counts", label: "Counting", state: "done" },
  { id: "cutover:teardown", label: "Clearing", state: "done" }, { id: "final:copy-out:database:pg", label: "Writing the database shop-postgres-1", state: "current" },
  { id: "final:copy-in:volume:uploads", label: "Writing the folder uploads", state: "pending" }, { id: "cutover:activate", label: "Starting", state: "pending" }, { id: "cutover:check", label: "Checking", state: "pending" },
];
const homeList = [
  { id: "m1", status: "CUTTING_OVER", createdAt: now(), updatedAt: now(), message: "", percent: 46, phase: "cutover", failed: false, source: { id: "s1", name: "ip-172-31-12-252" }, target: { id: "s2", name: "ip-172-31-6-178" } },
  { id: "m0", status: "ACCEPTED", createdAt: now(), updatedAt: new Date(Date.now() - 86400000).toISOString(), message: "", percent: 100, failed: false, source: { id: "s1", name: "old-vps" }, target: { id: "s2", name: "new-vps" } },
  { id: "m00", status: "ROLLED_BACK", createdAt: now(), updatedAt: new Date(Date.now() - 3 * 86400000).toISOString(), message: "", percent: 0, failed: false, source: { id: "s1", name: "old-vps" }, target: { id: "s2", name: "new-vps" } },
];
const manyEvents = Array.from({ length: 48 }, (_, i) => ({ id: `e${i}`, at: new Date(Date.now() - (48 - i) * 20000).toISOString(), kind: i % 17 === 5 ? "warn" : i === 0 ? "stage" : "item", message: i === 0 ? "Migration started. Looking at both servers." : i % 3 === 0 ? `Read ${(i * 7.3).toFixed(1)} MB.` : i % 3 === 1 ? `Reading the folder /srv/shop/data${i}` : "Wrote the folder on the new server." }));
const SCENARIOS = {
  activity: view("TRANSFERRING", 2, { events: manyEvents, steps: practiceSteps, progress: { phase: "rehearsal", message: "Copying", percent: 68, stepsDone: 17, stepsTotal: 25, current: "x" } }),
  home: view("PLANNED", 0),
  "home-empty": view("PLANNED", 0),
  switch: view("CUTTING_OVER", 3, { writerOwner: "none", steps: swSteps, progress: { phase: "cutover", message: "x", percent: 52, stepsDone: 4, stepsTotal: 8, current: "x" }, transfers: [{ itemKey: "database:pg", kind: "database", phase: "final", status: "uploading", bytes: 1.2e9, bytesHint: 3e9 }], events: [{ id: "e", at: new Date(Date.now() - 187000).toISOString(), kind: "stage", message: "Switching over. Your apps on the current server will stop for a short while." }] }),
  "live-why": null,
  live: view("OBSERVING", 4, { writerOwner: "target", apps: liveApps, liveAt: new Date(Date.now()).toISOString(), createdAt: new Date(Date.now() - 18 * 60000).toISOString(), actions: { ...noActions, canAccept: true, canRecover: true, canRetryLinks: true, canCheckLinks: true }, verification: { rehearsal: null, final: [{ id: "a", label: "Container web keeps running", status: "pass", detail: "" }] } }),
  accepted: view("ACCEPTED", 4, { writerOwner: "target", finished: true, apps: liveApps, liveAt: now(), createdAt: new Date(Date.now() - 18 * 60000).toISOString() }),
  practice: view("TRANSFERRING", 2, { steps: practiceSteps, progress: { phase: "rehearsal", message: "Copying", percent: 68, stepsDone: 17, stepsTotal: 25, current: "x" }, transfers: [{ itemKey: "database:pg", kind: "database", phase: "rehearsal", status: "uploading", bytes: 1.2e9, bytesHint: 3e9 }], actions: { ...noActions, canAbort: true } }),
  "ready-dialog": null,
  ready: view("READY_FOR_CUTOVER", 2, { actions: { ...noActions, canCutover: true, canAbort: true }, transfers: [{ itemKey: "volume:uploads", kind: "volume", phase: "rehearsal", status: "done", bytes: 7.4e8, bytesHint: null }], verification: { final: null, rehearsal: [
    { id: "container:api", label: "Container api keeps running", status: "pass", detail: "" }, { id: "container:web", label: "Container web keeps running", status: "pass", detail: "" },
    { id: "db:pg", label: "The database pg restored", status: "pass", detail: "150 tables, 6,358,487 rows." }, { id: "port:web:8080/tcp", label: "web answers", status: "pass", detail: "It answers (HTTP 200)." }, { id: "health:api", label: "Health check of api", status: "pass", detail: "Healthy." } ] } }),
  "plan": view("PLANNED", 1, { scanSummary: { source: sm({ memoryMb: 8192, cpus: 2 }), target: sm({ memoryMb: 4096, cpus: 4, diskFreeMb: 100000, empty: true }) }, actions: { ...noActions, canRescan: true, canConfirm: true, canEditPlan: true } }),
  "look-done": view("PLANNED", 0, { actions: { ...noActions, canRescan: true, canConfirm: true } }),
  "look-scanning": view("DISCOVERING", 0, { scanSummary: { source: sm(), target: null } }),
  "look-new-has-apps": view("PLANNED", 0, { scanSummary: { source: sm(), target: sm({ apps: 3, databases: 0, engines: [], empty: false }) }, actions: { ...noActions, canRescan: true } }),
};
const VARIANTS = [{ name: "narrow", w: 900, h: 900, theme: "light" }, { name: "light", w: 1440, h: 900, theme: "light" }, { name: "dark", w: 1440, h: 900, theme: "dark" }, { name: "phone", w: 390, h: 844, theme: "light" }];
const browser = await chromium.launch({ channel: "chrome", headless: true });
for (const v of VARIANTS) for (const [name0, body0] of Object.entries(SCENARIOS)) {
  const dialog = name0 === "ready-dialog"; const why = name0 === "live-why"; const name = name0; const body = dialog ? SCENARIOS.ready : why ? SCENARIOS.live : body0;
  if (ONLY.size && !ONLY.has(name)) continue;
  const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h } });
  await ctx.addInitScript((t) => { try { localStorage.setItem("theme", t); localStorage.setItem("cookie-consent", "accepted"); } catch { /* ignore */ } }, v.theme);
  await ctx.route((u) => u.hostname === apiUrl.hostname, async (route) => {
    const r = route.request();
    const cors = { "access-control-allow-origin": BASE, "access-control-allow-credentials": "true", "access-control-allow-headers": "content-type,authorization", "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS" };
    if (r.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const json = (s, b) => route.fulfill({ status: s, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify(b) });
    const p = new URL(r.url()).pathname;
    if (p === "/auth/me") return json(200, user);
    if (p === "/plans/current") return json(200, planInfo);
    if (p === "/migrations") return json(200, { migrations: name === "home" ? homeList : [] });
    if (p === "/servers") return json(200, [{ id: "s1", name: "ip-172-31-12-252", ip: "3.110.55.193", status: "connected", isLiveConnected: true }, { id: "s2", name: "ip-172-31-6-178", ip: "13.201.76.89", status: "connected", isLiveConnected: true }]);
    if (p === "/migrations/m1") return json(200, body);
    if (p === "/migrations/m1/diagnose") return json(200, { checkedAt: now(), window: "30 minutes", containers: 3, errorLines: 5, reassurance: "This is not a copy failure. Opslin copied your data and checked that every database count matches the old server.", disclaimer: "This is a best guess from the last few minutes of error messages. It cannot see inside your providers' accounts.", causes: [{ id: "no-answer", level: "likely", title: "MSG91 did not answer the new server", meaning: "The new server could not reach it. Either the service ignores requests from addresses it does not know (a common way to enforce an allowed list), or something between the two blocks it, such as a firewall.", services: ["MSG91"], count: 4, fix: ["If MSG91 has an allowed-address list, add 3.22.101.77.", "Check the new server's firewall or cloud security group allows outgoing connections."], example: "Error: connect ETIMEDOUT 52.66.1.2:443 api.msg91.com" }, { id: "dns", level: "possible", title: "The new server cannot look up some names", meaning: "A name could not be turned into an address.", services: [], count: 1, fix: ["Check the new server's DNS settings."], example: null }] });
    if (p === "/migrations/m1/domains") return json(200, { targetIp: "3.22.101.77", sourceIp: "54.210.12.34", domains: [{ name: "shop.example.com", state: "current-server", addresses: ["54.210.12.34"] }] });
    if (["/servers", "/apps", "/alerts"].includes(p)) return json(200, []);
    return json(200, {});
  });
  const page = await ctx.newPage();
  if (name === "plan") await ctx.addInitScript(() => { try { sessionStorage.setItem("smi-plan-seen:m1", "1"); } catch { /* ignore */ } });
  await page.goto(name.startsWith("home") ? `${BASE}/migrations` : `${BASE}/migrations/m1`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  if (process.env.FRAMES && name === "practice" && v.name === "light") { const fig = page.locator("figure").first(); for (const t of [0, 400, 800, 1200]) { await page.waitForTimeout(t ? 400 : 0); await fig.screenshot({ path: `${OUT}/frame-${t}.png` }); } }
  if (why) { await page.getByRole("button", { name: "Accept", exact: true }).click().catch(() => {}); await page.getByRole("button", { name: "Find out why" }).click(); await page.waitForTimeout(800); }
  if (name === "activity") { await page.getByRole("button", { name: "Accept", exact: true }).click().catch(() => {}); await page.evaluate(() => document.querySelectorAll("details").forEach((d) => { if (d.textContent?.trim().startsWith("Activity")) d.open = true; })); await page.waitForTimeout(400); }
  if (dialog) { await page.getByRole("button", { name: "Accept", exact: true }).click().catch(() => {}); await page.waitForTimeout(300); await page.getByRole("button", { name: /Switch now/ }).first().click({ force: true }); await page.waitForTimeout(800); await page.getByText("I understand the website pauses").click({ force: true }); await page.waitForTimeout(300); }
  await page.screenshot({ path: `${OUT}/${v.name}-${name}.png`, fullPage: !dialog });
  console.log("shot", v.name, name);
  await ctx.close();
}
await browser.close();
