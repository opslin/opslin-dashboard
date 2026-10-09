# Deployments page redesign: simple version, 3 image prompts

## Goal
One calm page that answers: **"Did anything fail, or is anything deploying right now, across all my apps?"** Nothing more. Same look as the Terminal and Monitoring pages we already built.

## What stays, what goes
- Stays: header with "Deploy new", three stat cards, one timeline of recent deployments with filters.
- New and simple: filter by app and status, "View details" that opens the deployment, "View logs" on failed ones, "Roll back" on good ones.
- Removed: the "Understanding deployments" explainer, the dead documentation links, the fake "ip-203-0-113-10" label, the wrong "Last 30 days" labels.
- Real data only: server name, app, commit, who or what started it, how long it took, how long ago.

---

## PROMPT 1: Deployments page (main)
```
Design a premium, minimal web app UI screen, 1536x1024, light theme, for a developer deployment platform called "Opslin" (Vercel, Railway and Linear level polish). Screen: "Deployments", the page that lists recent deployments across all apps. Keep it simple and easy for a beginner.

Shell: left white sidebar (thin right border) with logo "Opslin", nav Overview, Servers, Apps, Deployments (active, soft blue pill), Monitoring, Alerts, a "Platform" group, user card at the bottom. Slim top bar with search "Search or run a command... Cmd K", sun icon button, round avatar.

Page header: bold title "Deployments", grey subtitle "Everything that was released across your apps." On the right a blue button "Deploy new" with a rocket icon.

Three stat cards in a row (16px radius, hairline border, soft shadow, no icons bigger than 16px):
1. "Running now" - "1" with a small pulsing blue dot and the line "api is deploying".
2. "Failed this week" - "2" with a small red dot and the line "Last one 3 hours ago".
3. "Success rate" - "94%" with a thin green progress bar and "Last 7 days, 31 deployments".

Below, one large card "Recent deployments". Top row inside the card: a search field "Search app or commit", a filter chip row "All" (selected), "Running", "Failed", "Succeeded", and an app dropdown "All apps".
Then a clean list of 6 rows. Each row: round status icon (blue spinner for running, green check for succeeded, red x for failed), bold app name "storefront", small grey commit chip "a1b2c3d", one grey line "Fix checkout bug", then below in grey "Prod VPS 01 · by Alex Chen · 1m 12s · 2 hours ago". On the right a status pill ("Live", "Failed", "Deploying") and quiet buttons: "View details" (outline), and for good ones a small "Roll back" text button; failed rows have "View logs" instead. Running row shows a thin blue progress bar under the text and the label "Building".
Footer of the card: "Load more" outline button centered.
No explainer section, no big illustrations, no extra panels.

Style: Inter/Geist, white canvas, text #0f172a, muted #64748b, accent blue #2563eb, green #16a34a, red #dc2626, 12-16px radii, hairline borders, soft shadows, crisp Lucide icons, generous whitespace, realistic sample data, pixel-perfect alignment, no lorem ipsum, no watermark.
```

## PROMPT 2: Failed, empty and loading states
```
Design a premium web app UI sheet, 1536x1024, for the Opslin "Deployments" page, showing four small states in a 2x2 grid, each in a rounded card with a small label above it. Same style as the main Deployments screen.
1. "Something failed": the page with a thin red banner at the top "storefront failed to deploy 3 hours ago" with a "View logs" button and a "Try again" outline button. Below it one failed row expanded with a short plain-language reason box: "The build stopped: a package could not be installed. Check your package.json." and a "Copy error" link.
2. "No deployments yet": centered calm card with a rocket icon, title "Nothing deployed yet", line "Deploy your first app and it will show up here.", blue button "Deploy your first app".
3. "Nothing matches": the filter row with "Failed" selected and a small empty message "No failed deployments this week. Nice." with a green check, and a ghost button "Clear filters".
4. "Loading": skeleton version of the three stat cards and 4 list rows with soft grey shimmer blocks.
Style: Inter/Geist, white canvas, #0f172a, #64748b, accent #2563eb, red and green only for state, 12-16px radii, hairline borders, soft shadows, Lucide icons, realistic content, no lorem ipsum, pixel-perfect.
```

## PROMPT 3: Details drawer and roll back confirm
```
Design a premium web app UI, 1536x1024, the Opslin "Deployments" page dimmed and blurred in the background, with a right-side drawer (460px, white) open for one deployment, and a small centered confirm dialog shown beside it as a second variant (label them "Details" and "Roll back").
DRAWER: title "storefront", pill "Live", subtitle "Deployed 2 hours ago by Alex Chen". A simple vertical timeline with 4 steps and times: "Code received", "Built (48s)", "Health check passed", "Live". Then a small key-value list: Commit "a1b2c3d - Fix checkout bug", Branch "main", Server "Prod VPS 01", Duration "1m 12s". A collapsed "Build logs" section with a dark mono preview of the last 6 lines and a button "Open full logs". Footer buttons: "Open app" (outline) and "Roll back to this version" (outline).
DIALOG: rounded card with a blue circular-arrow icon, title "Roll back to a1b2c3d?", text "Opslin will deploy this version again. Your current version stays in the history.", a small card with "Version a1b2c3d - 2 hours ago", buttons "Cancel" and a blue "Roll back".
Style: Inter/Geist, white, #0f172a, #64748b, accent #2563eb, green for success, 12-16px radii, hairline borders, soft shadows, Lucide icons, realistic data, no lorem ipsum, pixel-perfect.
```

## Build notes (after images)
- Data: reuse the existing deployments API per app, but load only the latest 10 per app and merge. Stats computed over the last 7 days only, so the labels are true.
- "View details" opens the same deployment drawer that exists on the app page; "Roll back" reuses the new Roll back dialog.
- Filters (status, app, search) work in the browser on the loaded list.
- Needs backend for a cleaner version later: one endpoint for "latest deployments across all apps" (today it is one request per app) and the name of who started each deployment.
