# "No server yet" experience: audit, research, plan and 4 image prompts

## 1. What happens today (audit)
A new account has no server, so almost every page has to say something. Today each page does it in its own way:
- **Overview:** a "No servers yet" card with its own button.
- **Servers:** "No servers found" and a "Connect your server" button.
- **Monitoring and Terminal:** a full-page "Connect a server" block (I built these as separate full-page states).
- **Create app and Create database:** their own "connect a server first" notices.
- **Top bar:** an "Add server" button on every page.
So a new user sees the same "connect a server" message with a different look on 6 or more pages, big and blocking, and the real pages (Apps, Deployments, Monitoring) look empty and useless. It feels like spam, and it hides what the product can do.

## 2. Research (what good products do)
- **One setup checklist, not many prompts.** Onboarding guides recommend a short visible checklist (3 to 5 steps, with a progress bar) that stays in one place and carries across empty screens, so whichever blank page the user lands on, the next step is clear.
- **Empty state = one clear action, never a dead end.** A good empty state explains what will appear, why it matters and offers exactly one primary action.
- **Show the filled state before asking for work.** Sample or example data, clearly labelled, lets users see value first. "If your page needs data, show it populated with labelled example data rather than a void with a promise attached."
- **Progressive disclosure.** Don't surface every feature on day one. Reveal pages as they become useful.
- **Order steps by value to the user,** and let people skip and come back; save progress.

## 3. Recommendation (simple rules)
1. **One home for setup: the Overview page.** It becomes a "Get started" hub with a 3-step checklist: Connect a server, Connect GitHub, Deploy your first app (Add a domain is an optional 4th).
2. **A small "Get started" card in the sidebar** with a progress ring (for example "1 of 3"). It follows the user everywhere, so no page needs its own big block.
3. **Pages that need a server keep their real layout.** Apps, Deployments, Monitoring, Terminal, Databases, Backups, Storage and Alerts show the normal page with soft, clearly labelled **"Example data"** and **one slim banner** at the top: "Connect a server to see your own data" with a single button. No big full-page blocks.
4. **Max one prompt per screen.** The top-bar "Add server" button stays as the one global action; page banners can be dismissed and shrink to a small chip in the page header.
5. **Pages that do not need a server never mention it:** Settings, Teams, Billing and Plans, Docs.
6. **Inside flows, a blocker is a step, not an error.** Create app and Create database show "Step 1: Connect a server" inside the flow, with the same single button.
7. **After the first connect, celebrate once and point to the next step** ("Server connected. Next: deploy your first app").

## 4. Image prompts

### PROMPT 1: Overview as the "Get started" hub (brand-new account)
```
Design a premium, minimal web app UI screen, 1536x1024, light theme, for a developer deployment platform called "Opslin" (Vercel, Linear and Stripe level polish). Screen: "Overview" for a brand-new account with no server yet. It must feel welcoming, calm and clear, not empty or blocked.

Shell: left white sidebar (thin right border) with logo "Opslin", nav Overview (active, soft blue pill), Servers, Apps, Deployments, Monitoring, Alerts, a "Platform" group (Databases, Backups, Storage, Teams, Terminal, Settings) and a user card at the bottom. Slim top bar with search "Search or run a command... Cmd K", a quiet outline button "Add server", sun icon button and round avatar.

Content, top to bottom:
1. Greeting: small grey "Welcome to Opslin", big bold "Let's get your first app live", subtitle "Three quick steps. Most people finish in under 10 minutes."
2. A large rounded card "Get started" with a progress ring "0 of 3" on the left and a vertical checklist of 3 steps, each a row with a numbered circle, bold title, one grey line, and a button on the right:
   - 1 "Connect a server" - "Link a VPS so Opslin can run your apps" - blue primary button "Connect server" (the only filled button on the page), plus a small grey link "How it works".
   - 2 "Connect GitHub" - "So we can build from your code" - outline button, locked look with small text "After step 1".
   - 3 "Deploy your first app" - "Pick a repo and go live" - locked look "After step 2".
   A small text button "Skip for now" at the card's bottom right.
3. Below, a row of three soft cards "What you'll get" with small icons and short text: "Live monitoring" (CPU, memory, disk in one view), "One-click deploys" (push code, we do the rest), "Safe roll backs" (return to a good version anytime). Each has a tiny muted preview illustration of its screen.
4. A thin help strip: "Need help? Read the 5 minute guide" and "Talk to us".
No big empty-state illustrations, no repeated "connect" buttons beyond the checklist and the top-bar button.

Style: Inter/Geist, white canvas, text #0f172a, muted #64748b, accent blue #2563eb used only for the primary action, 12-16px radii, hairline borders, soft shadows, crisp Lucide icons, generous whitespace, realistic copy, pixel-perfect alignment, no lorem ipsum, no watermark.
```

### PROMPT 2: Server-dependent pages in "preview" mode (Apps and Monitoring side by side)
```
Design a premium web app UI sheet, 1536x1024, with two stacked halves labelled "Apps (no server yet)" and "Monitoring (no server yet)" for the Opslin dashboard. Same shell as the Overview screen (white sidebar, slim top bar). The pages keep their real layout, filled with softly faded, clearly labelled example data.

At the top of each page, under the page title, ONE slim banner (full width, 12px radius, very soft blue tint, hairline blue border, 56px high): a small plug icon, bold "Connect a server to see your own data", grey text "Takes about 2 minutes.", on the right a blue button "Connect server" and a small grey "Dismiss" text button. Nothing else about connecting appears on the page.
Below the banner the page shows its normal content at about 60% opacity with a small pill "Example data" (grey, with a tiny eye icon) near the title:
- APPS: a grid of three app cards (storefront, api, worker) with Healthy pills, tiny sparklines, branch and "2 hours ago" text, and a faded "Deploy new" button.
- MONITORING: the health score ring "96", four small resource cards (CPU, Memory, Disk, Network) with trend lines, and a chart, all softly faded.
Interactive controls on the faded content look disabled. Bottom-left of each half a tiny caption "Preview with example data".
Style: Inter/Geist, white canvas, #0f172a, #64748b, accent #2563eb only on the banner button, 12-16px radii, hairline borders, soft shadows, Lucide icons, realistic data, no lorem ipsum, pixel-perfect.
```

### PROMPT 3: Sidebar "Get started" card, quiet nav hints, and the collapsed chip
```
Design a premium web app UI sheet, 1536x1024, three close-up panels on a light grey canvas, each labelled, showing details of the Opslin navigation for an account with no server yet.
1. "Sidebar": the left sidebar (260px, white) with the nav. At the bottom above the user card, a compact "Get started" card (16px radius, soft blue tint): small progress ring "1 of 3", title "Finish setup", grey line "Next: Connect GitHub", and a small blue text link "Continue". Nav items that need a server (Apps, Deployments, Monitoring, Terminal, Databases, Backups, Storage) keep normal text but have a tiny grey dot on the right; no lock icons, nothing blocked.
2. "Hover hint": a small tooltip card next to the Monitoring nav item: "Needs a server. Connect one to see live data." with a blue text link "Connect server". Same style as the rest, 12px radius, soft shadow.
3. "After dismissing the banner": the page header of Deployments with the title on the left and, on the right, a small quiet chip with a plug icon "Connect a server" (outline, 28px high) next to the normal "Deploy new" button. Under the header a tiny line "Showing example data".
Style: Inter/Geist, white, #0f172a, #64748b, accent #2563eb, 12-16px radii, hairline borders, soft shadows, Lucide icons, no lorem ipsum, pixel-perfect.
```

### PROMPT 4: Inside flows, and the "server connected" moment
```
Design a premium web app UI sheet, 1536x1024, with three panels labelled "Create app", "Create database" and "Server connected" for the Opslin dashboard.
1. CREATE APP (no server): the "Deploy new app" wizard with a thin 3-step stepper at the top: "1 Server" (current, blue), "2 Code", "3 Review". The first step shows a calm card: server icon, title "First, connect a server", one grey sentence "Your app needs a place to run. This takes about 2 minutes.", one blue button "Connect server", and a small link "Use Opslin Cloud later". The next steps are greyed. No error styling, no red.
2. CREATE DATABASE (no server): the same pattern with the title "Pick where your database lives" and the same single button, so both flows look identical.
3. SERVER CONNECTED: the Overview page right after the first connection. A one-time slim success banner (soft green tint, check icon): "Prod VPS 01 is connected." with grey text "Next: deploy your first app" and a blue button "Deploy an app". Under it the Get started card now shows "1 of 3" with step 1 ticked green, step 2 active, and a subtle confetti-free glow on the progress ring. The nav dots on server pages have disappeared.
Style: Inter/Geist, white canvas, #0f172a, #64748b, accent #2563eb, success green only for completed state, 12-16px radii, hairline borders, soft shadows, Lucide icons, realistic copy, no lorem ipsum, pixel-perfect.
```

## 5. Build notes (after images)
- One shared "needs a server" system: a `useSetupState()` hook (servers, GitHub connected, apps count) and three small components: `SetupBanner`, `SetupChecklist`, `ExampleDataBadge`. Every page uses them, so wording and look are identical.
- Real data: the checklist reads real server, GitHub and app counts. "Example data" is fixed sample content, always labelled.
- Dismissed banners and the checklist skip are remembered in the browser.
- Needs backend later: a server-side "setup progress" so the checklist follows the user across devices.
