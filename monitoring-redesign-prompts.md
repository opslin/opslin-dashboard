# Monitoring page redesign: audit, research, design brief and 5 image prompts

## 1. Audit of the current page (`/monitoring`, "System Monitor")
What it does today: one server picker, a time range (1h, 6h, 24h, 7d), a health card, 4 metric cards (CPU, Memory, Disk, Uptime) with sparklines, a network chart, a "Peak analysis" card, CPU and Memory "pressure" charts and a "Top applications" table. Data comes from `/metrics/:server/current`, `/metrics/:server/history` and `/metrics/apps/overview`; polled every 30 seconds.

Problems found
- **Fake data.** "Processes 128" and "Users 1" are hard-coded. The little trend arrows (for example "↑ 3.2%") are made-up maths and not real changes. App sparklines are invented from a single number. The app "Uptime" column shows the time since the record was last updated, not uptime.
- **"System Healthy" is always shown** in the health card, even when the state is Warning or Critical.
- **It explains nothing.** It shows numbers but never says in plain words "your disk will be full in 9 days" or "memory is high because of app X". A beginner has to interpret charts.
- **No link to action.** No link to Alerts, no "what should I do", no way to jump to the app or the server that causes the load.
- **One server at a time.** There is no fleet overview, so with 5 servers you must open each one in turn.
- **Charts are hand-written SVG.** No hover tooltip, no zoom, no shared cursor between charts, no event markers (for example a deploy).
- **Weak states.** An offline server and "no data yet" look the same as a loading screen. No guide for first-time users. The icons are large emoji-style, which clashes with the rest of the new design.
- **Overlap with other pages.** The server page has a Metrics tab and the app page has a Metrics tab, but the global page repeats them without adding anything.

## 2. Research (Netdata, Better Stack, Railway, Vercel Observability, Datadog, Grafana)
- **Netdata:** anomaly detection that points to "what changed and why", and "troubleshoot in seconds, no query language, point and click".
- **Better Stack:** an uptime view first (is it up?), alerts that automatically open an incident, and a clean incident timeline plus a status page.
- **Railway / Vercel:** per-service metrics with a shared time range and a hover cursor that moves across all charts at once. Deploy markers on the charts so you can see "the spike started after this deploy".
- **Datadog / Grafana:** a fleet table (all hosts in one list, sortable, with sparkline per row) and threshold lines on charts. Their weakness for beginners: far too many options.
- **Takeaways for Opslin's audience (non-DevOps):**
  1. Start with one answer: **"Is everything OK?"** in a plain sentence, with a health score.
  2. **Insights in plain words** ("Disk will be full in about 9 days. Clean up Docker images to free 12 GB") each with one action button.
  3. **Fleet first, details second:** a table of all servers, click to drill in.
  4. Charts with **hover cursor, deploy and restart markers, and threshold zones**.
  5. **Link to Alerts:** show active alerts here and let people set a threshold alert straight from a chart ("Alert me when above 85%").
  6. A short **guide** that explains CPU, memory, disk and load in everyday words.

## 3. Design brief (what to build)
**Page:** "Monitoring" with a slim header: title, server switcher ("All servers" or one server), time range segmented control (1h, 6h, 24h, 7d), "Live" indicator with auto-refresh, and a "Guide" button.

**Tabs (3):** **Overview** (default), **Servers**, **Apps**.

**Overview**
1. **Health summary banner:** big plain sentence ("Everything looks healthy" or "2 things need attention"), a health score ring (0 to 100), and small counts: Servers online, Apps healthy, Active alerts.
2. **Insights ("What we noticed")**: up to 4 cards, each with a severity color, a one-line finding in plain words, a short "why it matters", and one action button ("Clean up disk", "View app", "Create alert").
3. **Four resource cards:** CPU, Memory, Disk, Network. Each: big value, "of 4 cores" or "18 of 80 GB", a status chip (Good / Watch / High), a real sparkline from history, and the real peak for the selected range. No made-up trend arrows.
4. **Main chart:** one large chart with tabs (CPU, Memory, Disk, Network, Load), shared hover cursor and tooltip, threshold zones (70% and 90%), and small markers for **deploys and restarts**. Under it a legend and "Create alert from this chart".
5. **Top apps by resource use:** table with name, health, CPU bar, memory bar, restarts, link to the app.
6. **Active alerts card:** last 3 alerts with severity and time, "View all alerts".

**Servers tab:** a table of all servers: name, status dot, CPU, Memory, Disk (each a mini bar with number), load, agent version, last seen; sortable; row click opens the server.

**Apps tab:** a table of apps with health, CPU, memory, restarts, plus for the selected app a compact "Requests" panel (requests per minute, error rate, slowest routes) using the existing request metrics.

**States:** loading skeletons; **Waiting for first data** (agent connected, no metrics yet); **Server offline** (last known values greyed, "Offline since 14:02", Reconnect and Show how to fix); **No servers** (connect a server); stale data warning.

**Guide:** a "How to read this page" drawer: what CPU, memory, disk and load mean in everyday words, what is normal, when to worry, and three common fixes. First-time coach marks on 3 items.

**Style:** same Opslin design: white app, near-black text, blue accent (#2563eb), 12 to 16px radii, hairline borders, soft shadows, tabular numbers for metrics, Lucide icons (small, no big emoji icons), chart colors from the existing palette (blue, violet, amber, green), status colors green / amber / red used only for state.

---

## PROMPT 1: Overview (healthy)
```
Design a premium, minimal web app UI screen, 1536x1024, light theme, for a developer deployment platform called "Opslin" (Vercel, Linear, Better Stack and Railway level polish). Screen: "Monitoring", Overview tab, everything healthy.

Shell: left white sidebar (thin right border) with logo "Opslin" and nav Overview, Servers, Apps, Deployments, Monitoring (active, soft blue pill), Alerts, a "Platform" group, user card at the bottom; slim top bar with search "Search or run a command... Cmd K", sun icon button, round avatar.

Page header row: bold title "Monitoring"; a server switcher chip "All servers" with chevron; on the right a segmented control "1h | 6h | 24h | 7d" (24h selected), a small green pulsing dot with "Live", and an outline button "Guide" with a question-circle icon. Under the header, three tabs: Overview (active, blue underline), Servers, Apps.

Content, top to bottom:
1. Health banner card (16px radius, hairline border, very soft green tint at left): a circular health score ring "96" in green, headline "Everything looks healthy" and grey subline "3 servers online, 7 apps running, no active alerts. Updated 12 seconds ago." On the right three small stat blocks: Servers online 3/3, Apps healthy 7/7, Active alerts 0.
2. Section "What we noticed" with two insight cards side by side: a green card "Disk is growing slowly. About 62 GB free, enough for roughly 5 months." with a small ghost button "See disk"; and a blue info card "Prod VPS 01 restarted 2 days ago. Memory has been steady since." with a button "View activity".
3. Four resource cards in a row: CPU "23%" "of 4 cores", chip "Good" in green, a clean blue sparkline, small grey "Peak 61% at 14:20"; Memory "58%" "4.6 of 8 GB", chip "Good"; Disk "23%" "18 of 80 GB", chip "Good"; Network "1.2 MB/s in, 380 KB/s out" with a two-line sparkline. Tabular numbers, no big icons, only a tiny icon in the card header.
4. A large chart card "Resource usage" with chart tabs CPU, Memory, Disk, Network, Load (CPU selected), a smooth blue area chart for 24h, faint threshold bands at 70% (amber) and 90% (red), tiny vertical markers with rocket icon labelled "Deploy" and a restart icon labelled "Restart", a hover tooltip showing "14:20, CPU 61%". Below the chart a small link "Alert me when above 85%".
5. Two cards side by side: "Top apps by resource use" table (App, Health pill, CPU bar, Memory bar, Restarts) with 4 realistic rows (storefront, api, worker, postgres); and "Recent alerts" with an empty state "No alerts in the last 24 hours" and a check icon.

Style: Inter/Geist, white canvas, text #0f172a, muted #64748b, accent blue #2563eb, success green #16a34a, amber #d97706, red #dc2626; hairline borders, 12-16px radii, soft shadows, crisp Lucide icons, lots of whitespace, realistic data, pixel-perfect alignment, no lorem ipsum, no watermark.
```

## PROMPT 2: Overview (something needs attention)
```
Design a premium web app UI, 1536x1024, same Opslin "Monitoring" Overview tab, but with problems. Same shell, header, tabs, and time range controls.

Health banner: amber-tinted card with a health score ring "68" in amber, headline "2 things need attention", subline "Prod VPS 01 disk is almost full. The api app restarted 4 times in the last hour." Right side counts: Servers online 3/3, Apps healthy 6/7, Active alerts 2 (red).
"What we noticed" with three insight cards with colored left borders:
- Red: "Disk will be full in about 3 days" - "Prod VPS 01 is at 91% (73 of 80 GB). Apps stop working when the disk is full." Button "Free up space" and ghost link "Why?".
- Amber: "api keeps restarting" - "4 restarts in 1 hour, memory hit its limit each time." Buttons "View logs" and "Raise memory limit".
- Blue: "Traffic is 2x higher than usual" - "Likely from the deploy at 13:10." Button "View deployment".
Four resource cards: CPU 41% (chip "Watch" amber), Memory 83% (chip "High" amber, sparkline climbing), Disk 91% (chip "High" red, red bar), Network normal. Under Disk a small line "Full in about 3 days".
Main chart: Memory selected, line crossing into the amber and red bands, vertical dashed markers "Deploy 13:10" and three small "Restart" markers; tooltip open on one point. A button "Create alert" next to the chart.
Right side card "Active alerts": two rows with red and amber dots: "Disk above 90% on Prod VPS 01 - 12 min ago", "Memory above 80% on Prod VPS 01 - 1 h ago", each with small "Silence" button, and link "View all alerts".
Same style tokens: Inter/Geist, white canvas, #0f172a, #64748b, accent #2563eb, green/amber/red used only for state, 12-16px radii, hairline borders, soft shadows, Lucide icons, realistic data, no lorem ipsum.
```

## PROMPT 3: Servers tab (fleet) and Apps tab
```
Design a premium web app UI, 1536x1024, split into two stacked halves labelled "Servers tab" and "Apps tab" for the Opslin Monitoring page. Same shell and header.

SERVERS TAB: a card titled "Servers" with a search field and a status filter chip row (All, Online, Offline, Needs attention). A table with columns: Server (name, IP, small status dot), CPU, Memory, Disk (each a number plus a thin colored bar: green, amber, red), Load, Agent (version with a small amber "Update available" tag on one row), Last seen. 5 realistic rows: "Prod VPS 01" online with disk 91% in red, "Staging" online all green, "Worker 02" online memory amber, "Backup box" offline (greyed, "Offline since 14:02", small "Reconnect" button), "EU edge" online. Hover row highlight; row chevron. Above the table a tiny summary "4 online, 1 offline, 2 need attention".

APPS TAB: a table: App (icon, name, server), Health pill, CPU bar, Memory bar, Restarts (red number if above 3), Requests per min, Error rate. Below it a selected-app panel "api" with four compact stat tiles (Requests/min 482, Error rate 0.4% green, Median response 86 ms, Slowest route "/checkout 1.2 s" amber) and a small line chart of response time, a mini list "Slowest routes" with 3 rows and a link "Open app metrics".
Style: Inter/Geist, white canvas, #0f172a, #64748b, accent #2563eb, status colors only for state, 12-16px radii, hairline borders, soft shadows, tabular numbers, Lucide icons, realistic data, no lorem ipsum.
```

## PROMPT 4: Empty, waiting, and offline states
```
Design a premium web app UI sheet, 1536x1024, with four state cards in a 2x2 grid for the Opslin Monitoring page (same shell visible only as a faint frame), each labelled:
1. "No servers yet": calm illustration-free card with a server icon, title "Connect a server to start monitoring", one line "Opslin shows CPU, memory, disk and network as soon as your server connects", a blue "Connect a server" button, and a grey link "How does this work?".
2. "Waiting for first data": a card with a soft animated pulse ring, title "Your server is connected", line "The first numbers arrive within a minute. This page updates by itself.", a small progress shimmer, and a small timeline: Agent connected (done check), Collecting metrics (active spinner), First chart ready (pending).
3. "Server offline": greyed resource cards behind a banner "Prod VPS 01 went offline at 14:02 (23 minutes ago)". Buttons "Reconnect" (dark) and "Show how to fix" (outline). Last known values shown in muted grey with a "Last known" label and a flat dashed line chart.
4. "Stale data": a thin amber banner at the top of the normal page "Showing data from 6 minutes ago. We're having trouble reaching the agent." with a "Retry" button.
Style: Inter/Geist, white canvas, #0f172a, #64748b, accent #2563eb, amber and red only for state, 12-16px radii, hairline borders, soft shadows, Lucide icons, no lorem ipsum, pixel-perfect.
```

## PROMPT 5: Guide drawer, alert-from-chart, and first-time tips
```
Design a premium web app UI sheet, 1536x1024, with three parts for the Opslin Monitoring page.
LEFT (about 40%): a right-side "How to read this page" drawer (440px, white, blurred slate backdrop behind a faint dashboard). Title "How to read this page", subtitle "The four numbers that matter". Four expandable rows with small icons: CPU ("How hard the server is working. Under 70% is fine."), Memory ("Space apps use to run. Above 85% apps may restart."), Disk ("Storage for files and images. Above 90% is urgent."), Load ("How many tasks wait for the CPU. Compare with your number of cores."). The CPU row is expanded and shows a small green / amber / red scale bar with labels "Good, Watch, High", plus "What to do when it's high" with 3 short bullets and a button "Open command library". A footer line "Numbers refresh every 30 seconds."
CENTRE (about 35%): a popover "Create alert" anchored to a chart: title "Alert me when...", a sentence builder with three small selects "Memory" "is above" "85%" and "for 5 minutes", a row of channel checkboxes (Email, Slack, Webhook), a small preview "This would have fired 2 times in the last 24 hours", buttons "Cancel" and "Create alert".
RIGHT (about 25%): three coach-mark tooltips numbered 1-3 around a mini dashboard: "Health summary: your answer in one sentence", "What we noticed: plain-language findings with a fix", "Chart markers: deploys and restarts show what changed", with "Skip tour" and "Next" buttons.
Style: Inter/Geist, white canvas, #0f172a, #64748b, accent #2563eb, green/amber/red only for state, 12-16px radii, hairline borders, soft shadows, Lucide icons, realistic content, no lorem ipsum, pixel-perfect.
```

## 4. Build notes (after images)
- **Real now:** server and time range switching, health summary and insights computed from real metrics (state thresholds, disk growth rate from history for "full in about N days", restart counts and unhealthy apps from the apps overview), resource cards with real peaks, one shared chart with hover cursor (Recharts), threshold zones, servers fleet table (all servers' `/metrics/:id/current`), apps table, per-app request panel from the existing `/metrics/apps/:id/requests/*` endpoints, offline / waiting / stale states, guide drawer and first-time tips (browser storage).
- **Removed:** the hard-coded Processes and Users values, the made-up trend arrows, the invented app sparklines, the always-green "System Healthy", and the wrong "Uptime" column.
- **Needs backend or more data:** deploy and restart markers on charts need deployment and restart timestamps (deploys exist; restarts need an event feed), active alerts need the alerts API on this page, "Create alert" needs alert-rule creation, per-app time series for app sparklines, and any AI-written insight text. Insights will be rule-based until then.
