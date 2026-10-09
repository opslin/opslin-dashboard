# Terminal page redesign: audit, research, design brief and 5 image prompts

## 1. Audit of the current page (`/terminal`)
What it does today: one xterm.js terminal over a WebSocket (`/terminal/:serverId`), a server picker (live servers only), session tabs, 5 hard-coded quick commands, a status bar. Gated by plan feature `server.terminal`.

Problems found
- **Dead buttons.** "Saved Sessions", "Snippets", Copy, Paste, Clear do nothing. "View All Snippets" links to `#`.
- **Fake information.** The session path (`/opt/opslin`) is invented. "Secure" and "WebSocket" are static labels. The auto-reconnect switch isn't connected to anything.
- **"New session" doesn't create a new shell.** Every tab shows the same single terminal, so tabs are misleading.
- **No guidance.** A beginner sees a black box and a blinking cursor. No "what can I type", no explanation of what a command does, no warning before risky commands (`rm -rf`, `apt upgrade -y`).
- **Weak connection states.** Only "Connected / Disconnected". No connecting, reconnecting, or "agent offline" help with a way to fix it.
- **Quick commands run instantly.** `sudo apt upgrade -y` runs with one click and no confirmation.
- **Heavy chrome.** Three cards and a header above a small terminal. The terminal should be the hero.

## 2. Research (Warp, Termius, Railway/Render shells, Vercel wterm, VS Code terminal)
- **Warp:** the command palette (Cmd K) as the one entry point, command *blocks* (each command and its output grouped, copyable), natural-language to command suggestions, and saved reusable workflows with fill-in parameters.
- **Termius:** snippets, shared with a team, run on one or many hosts, and a clean tab/host switcher.
- **Railway / Render / Coolify shells:** one click opens a shell into the running service; minimal chrome, clear "connected to X" line, easy copy/clear/reconnect.
- **VS Code:** split panes, a searchable command history, and a find-in-terminal bar.
- **Takeaways for Opslin's audience (non-DevOps people):** (1) terminal first, (2) a plain-language command library instead of memorising commands, (3) "type what you want" with an approval step, (4) safety around risky commands, (5) short in-page guidance that disappears once you know the basics.

## 3. Design brief (what to build)
**Layout (1440 wide):** the app shell as now. Page header is one slim row: "Terminal", a server picker chip with a green dot, a connection pill, and buttons: "Command library" and "Guide". Below, a terminal workspace with two parts:
- **Left/main (about 75%):** the terminal card with a tab bar (one real shell per tab, close buttons, "+" button), a toolbar (Copy, Paste, Clear, Find, Font size, Fullscreen), the terminal itself, and a **"Describe what you want" bar** under it.
- **Right drawer (about 25%, collapsible):** **Command library**, a searchable list of commands grouped by task, each with a plain-language title, a one-line description, a risk tag, and "Insert" and "Run" actions.

**The helpful ideas to include**
1. **Command library** with groups: Check health (disk, memory, CPU, uptime), Apps and Docker (running containers, logs of an app, restart Docker), Network (open ports, test a URL), Updates and security, My saved. Search at the top. Plain titles ("See how much disk is left"), command shown in small mono text under it.
2. **Safe by default:** "Insert" puts the command on the prompt without running it. "Run" is available only for read-only commands. Risky commands (updates, deletes, restarts) show an amber "Changes your server" tag and ask for confirmation in a small popover that explains what will happen.
3. **Ask for a command:** a bar under the terminal, "Describe what you want, e.g. show the last 50 lines of my app's logs". It returns a command preview card with a one-sentence explanation and the buttons "Insert" and "Run" (after confirm). The user always approves before anything runs.
4. **Explain this:** select text or a failed command and click "Explain" to get a short plain-language explanation and a suggested fix.
5. **Command palette (Cmd K):** search commands, switch server, new tab, open guide.
6. **Guide:** a "New to the terminal?" card in the empty state and a Guide button that opens a small drawer with 5 steps (What is a terminal, run your first command, move around folders, read output, stay safe) and a cheat sheet of 10 commands. A tiny first-time tip tour (3 steps) points at the library, the ask bar and the status bar.
7. **Clear connection states:** Connecting (spinner), Connected, Reconnecting (with countdown), Disconnected, Server offline (with "Reconnect" and "Show how to fix").
8. **Status bar:** server name and IP, shell user, connection state, "Encrypted", session timer. Only show real data.

**Style:** same Opslin design: white app, near-black text, blue accent (#2563eb), 12 to 16px radii, hairline borders. The terminal itself is a dark panel (near-black slate, not pure black) with a readable mono font (JetBrains Mono 14px), subtle green prompt, soft selection color. Lucide-style icons. Premium, calm, lots of spacing.

---

## PROMPT 1: Main terminal screen (connected, active)
```
Design a premium, minimal web app UI screen, 1536x1024, light app theme with a dark terminal panel, for a developer deployment platform called "Opslin" (Vercel, Railway and Warp level polish). Screen: "Terminal" page, connected state.

Shell: left white sidebar (thin right border) with logo "Opslin" and nav Overview, Servers, Apps, Deployments, Monitoring, Alerts, Platform group, with "Terminal" highlighted as a soft blue pill; slim top bar with search field "Search or run a command... Cmd K", sun icon button and round avatar.

Page header row: bold title "Terminal"; to its right a server chip "Prod VPS 01" with a green dot and a small chevron; a small green pill "Connected"; on the far right two outline buttons "Command library" (book icon) and "Guide" (question-circle icon).

Main area is two columns. LEFT (about 75%): one large rounded card (16px radius, hairline border, soft shadow). Top of the card: a tab bar with two tabs "Shell 1" (active, white, with a small green dot) and "Shell 2" with small x buttons and a "+" button; on the right of the bar a toolbar of small icon buttons: Copy, Paste, Clear, Search, Text size, Fullscreen. Under it a dark terminal panel (near-black slate #0b1220, 14px JetBrains Mono) showing realistic output: prompt "deploy@prod-vps-01:~$ docker ps", a neat table of 3 running containers (api, web, postgres) with status "Up 3 days", then "deploy@prod-vps-01:~$ df -h" with a short disk table, then an empty prompt with a blinking block cursor. Green prompt, soft white text, muted grey headers. Under the terminal inside the card, a rounded input bar with a sparkle icon: "Describe what you want, e.g. show the last 50 lines of my app logs" and a small "Ask" button. Bottom status strip: green dot "Connected", "deploy@prod-vps-01", "203.0.113.24", lock icon "Encrypted", "Session 12:41".

RIGHT (about 25%): a white card titled "Command library" with a search input and category chips (All, Health, Apps, Network, Updates, Saved). Below, a list of 5 items, each with a small icon, bold plain title ("See how much disk is left"), one grey line ("Shows used and free space"), the command in small mono text "df -h", and small buttons "Insert" and "Run" on hover. One item has an amber tag "Changes your server".

Style: Inter/Geist, white canvas, text #0f172a, muted #64748b, accent blue #2563eb, success green #16a34a, amber #d97706. Hairline borders, soft shadows, 12-16px radii, crisp Lucide icons, generous whitespace, realistic data, pixel-perfect alignment, no lorem ipsum, no watermark.
```

## PROMPT 2: Command library + safe run confirmation
```
Design a premium web app UI, 1536x1024, same Opslin Terminal page as before (white shell, dark terminal panel on the left, Command library drawer on the right). Show the Command library drawer wide open (about 380px) with a search field "Search commands, e.g. disk, logs, restart", category chips (All, Health, Apps and Docker, Network, Updates and security, Saved). A section "Check health" with 3 rows and a section "Apps and Docker" with 3 rows. Each row: icon tile, bold plain title ("See running apps", "Show my app's latest logs", "Restart Docker"), grey one-line description, command in small mono text, and a right side "Insert" outline button and a small "Run" button. Rows that only read data show a small green "Read-only" tag; rows that change things show an amber "Changes your server" tag.
Also show a small popover confirmation anchored to the "Restart Docker" row: title "Restart Docker?", one calm sentence "This stops and starts all containers on Prod VPS 01. Your apps will be unavailable for about 10 seconds.", the command in a mono box "sudo systemctl restart docker", and buttons "Cancel" and a blue "Run command".
The left terminal is dimmed slightly behind, still visible, with a command just inserted on the prompt (not yet run) highlighted by a subtle blue outline and a tiny hint "Press Enter to run".
Top: "+ New snippet" blue button in the drawer header. Same style tokens as the main screen: Inter/Geist, #0f172a text, #64748b muted, #2563eb accent, green and amber tags, 12-16px radii, hairline borders, soft shadows, Lucide icons, realistic content, no lorem ipsum.
```

## PROMPT 3: "Describe what you want" (ask for a command) + Explain
```
Design a premium web app UI, 1536x1024, the same Opslin Terminal page. Focus on the "Describe what you want" bar under the terminal expanded into a result card. The user typed "show me which apps use the most memory". Above the bar a floating white card (16px radius, soft shadow) appears titled with a sparkle icon "Suggested command": a dark mono box with "docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}'", below it a one-sentence plain explanation "Shows memory used by each running app, once. Read-only, nothing changes.", a green "Read-only" tag, and buttons "Insert" (outline) and "Run" (blue), plus a small "Copy" icon and a thumbs-up/thumbs-down pair.
In the terminal above, a previous command failed with a red error line "permission denied while trying to connect to the Docker daemon socket". A small floating chip near it says "Explain this error" (sparkle icon). Show its expanded tooltip card: "This user can't talk to Docker. Run the command with sudo or add the user to the docker group." with a button "Insert fix".
Left terminal remains dark slate, mono font, realistic output. Same Opslin style tokens: Inter/Geist, white canvas, #0f172a, #64748b, accent #2563eb, 12-16px radii, hairline borders, Lucide icons, calm and premium, no lorem ipsum.
```

## PROMPT 4: Empty / first-time state with guide
```
Design a premium web app UI, 1536x1024, Opslin "Terminal" page, first-time state. White shell as before. Page header: "Terminal", server chip "Prod VPS 01" with a green dot, a green "Connected" pill, buttons "Command library" and "Guide".
Main area: the terminal card (dark slate panel) shows only the welcome lines: "Connected to Prod VPS 01 as deploy" and an empty prompt with blinking cursor. Floating over the terminal's centre-right, a white "New to the terminal?" card (16px radius, soft shadow): friendly title, one calm line "A terminal lets you give your server written instructions. Try your first one:", a dark mono box "uptime" with a "Try it" blue button, and under it three small links "What is a terminal?", "Move around folders", "Stay safe". A small "Dismiss" text button.
On the right, the Command library drawer with the first group "Start here" highlighted and a three-step coach-mark tour: numbered blue dots 1 (library), 2 (ask bar), 3 (status bar) with small tooltip bubbles ("Pick a ready-made command", "Or describe what you want", "See who and where you are connected"), and "Skip tour" and "Next" buttons.
Same style: Inter/Geist, white canvas, #0f172a, #64748b, accent #2563eb, 12-16px radii, hairline borders, soft shadows, Lucide icons, realistic content, no lorem ipsum.
```

## PROMPT 5: Guide drawer + connection states
```
Design a premium web app UI sheet, 1536x1024, with two parts for the Opslin Terminal page.
LEFT HALF: a right-side "Terminal guide" drawer (420px, white, blurred slate backdrop behind). Title "Terminal guide", subtitle "Five minutes to feel comfortable". A 5-step list with progress dots: 1 What is a terminal, 2 Run your first command, 3 Move around folders (cd, ls, pwd), 4 Read the output, 5 Stay safe (what to double-check). Step 3 is expanded showing three tiny rows each with a mono command chip and a plain explanation: "pwd - where am I", "ls - what is here", "cd logs - go into the logs folder". Below it a "Cheat sheet" card with 8 common commands in two columns with copy icons, and a footer link "Open command library".
RIGHT HALF: a vertical stack of 5 small terminal-card states, each labelled: "Connecting" (spinner, "Opening a secure shell on Prod VPS 01..."), "Connected" (green dot), "Reconnecting" (amber, "Connection dropped. Retrying in 4s", with a "Retry now" button), "Disconnected" (grey, "Session ended", blue "Start new session" button), "Server offline" (red icon, "Prod VPS 01 isn't reachable. The Opslin agent stopped responding.", buttons "Reconnect" and "Show how to fix").
Style as before: Inter/Geist, white canvas, dark slate terminal areas, #0f172a / #64748b / #2563eb, success green, amber, red, 12-16px radii, hairline borders, soft shadows, Lucide icons, no lorem ipsum, pixel-perfect.
```

## 4. Build notes (after images)
- Real now: server picker, xterm session, copy/paste/clear/find via xterm APIs, fullscreen, real per-tab shells (one WebSocket per tab), reconnect states, command library (client-side list, plus "My saved" in local storage), risk tags, confirm-before-run, Cmd K, guide and tour.
- Needs backend: "Describe what you want" and "Explain this" (an AI endpoint), shared/team snippets and saved sessions (server storage), real latency, current directory in the tab title.
- Remove: fake path, static "WebSocket" label, dead buttons.
