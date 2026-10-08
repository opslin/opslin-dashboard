export type CommandRisk = "read" | "change";

export type CommandGroup = "start" | "health" | "apps" | "network" | "updates" | "saved";

export type LibraryCommand = {
    id: string;
    title: string;
    description: string;
    command: string;
    group: CommandGroup;
    risk: CommandRisk;
    /** Shown in the confirmation popover for commands that change the server. */
    warning?: string;
};

export const GROUP_LABELS: Record<CommandGroup, string> = {
    start: "Start here",
    health: "Check health",
    apps: "Apps and Docker",
    network: "Network",
    updates: "Updates and security",
    saved: "Saved",
};

export const FILTERS: Array<{ id: "all" | CommandGroup; label: string }> = [
    { id: "all", label: "All" },
    { id: "health", label: "Health" },
    { id: "apps", label: "Apps" },
    { id: "network", label: "Network" },
    { id: "saved", label: "Saved" },
];

export const LIBRARY: LibraryCommand[] = [
    { id: "uptime", title: "See how long the server has been on", description: "A simple, safe first command", command: "uptime", group: "start", risk: "read" },
    { id: "pwd", title: "Find your current folder", description: "Shows where you are", command: "pwd", group: "start", risk: "read" },
    { id: "ls", title: "See files and folders", description: "Lists what is here", command: "ls -la", group: "start", risk: "read" },
    { id: "whoami", title: "See who you are logged in as", description: "Shows your user name", command: "whoami", group: "start", risk: "read" },

    { id: "disk", title: "See how much disk is left", description: "Used and free disk space", command: "df -h", group: "health", risk: "read" },
    { id: "memory", title: "Check memory", description: "How much RAM is being used", command: "free -h", group: "health", risk: "read" },
    { id: "cpu", title: "Check CPU", description: "See the busiest processes", command: "top -b -n 1 | head -20", group: "health", risk: "read" },
    { id: "big-folders", title: "Find what is using disk space", description: "Biggest folders in this folder", command: "du -sh * | sort -rh | head -10", group: "health", risk: "read" },

    { id: "containers", title: "Show running apps", description: "View running containers", command: "docker ps", group: "apps", risk: "read" },
    { id: "container-memory", title: "See container memory", description: "Memory used by each app", command: "docker stats --no-stream", group: "apps", risk: "read" },
    { id: "app-logs", title: "View app logs", description: "Last 50 lines of an app's logs. Replace api with your app name", command: "docker logs --tail 50 api", group: "apps", risk: "read" },
    {
        id: "restart-docker",
        title: "Restart Docker",
        description: "Stops and restarts all containers",
        command: "sudo systemctl restart docker",
        group: "apps",
        risk: "change",
        warning: "This stops and starts all containers on this server. Your apps will be unavailable for about 10 seconds.",
    },

    { id: "ports", title: "See open ports", description: "List listening ports", command: "ss -lnt", group: "network", risk: "read" },
    { id: "public-ip", title: "Find the server's public address", description: "Asks an outside service for your IP", command: "curl -s https://ifconfig.me && echo", group: "network", risk: "read" },
    { id: "test-url", title: "Test that a website answers", description: "Shows the response headers. Replace the address", command: "curl -I https://example.com", group: "network", risk: "read" },

    {
        id: "apt-update",
        title: "Update the system",
        description: "Install the latest security updates",
        command: "sudo apt update && sudo apt upgrade -y",
        group: "updates",
        risk: "change",
        warning: "This installs updates on the server. Some services may restart, and it can take a few minutes.",
    },
    { id: "last-logins", title: "See recent logins", description: "Who logged in lately", command: "last -n 10", group: "updates", risk: "read" },
    {
        id: "reboot",
        title: "Restart the server",
        description: "Reboots the whole machine",
        command: "sudo reboot",
        group: "updates",
        risk: "change",
        warning: "The server will go offline for a minute or two and this session will end. All apps restart afterwards.",
    },
];

/** Commands we treat as risky when typed by hand or suggested. */
const RISKY_PATTERN = /\b(rm\s+-[a-z]*r|rm\s+-[a-z]*f|mkfs|dd\s+if=|shutdown|reboot|halt|systemctl\s+(restart|stop)|apt(-get)?\s+(upgrade|remove|purge)|docker\s+(rm|stop|kill|system\s+prune)|chmod\s+-R|chown\s+-R|>\s*\/dev\/)/i;

export function commandRisk(command: string): CommandRisk {
    const known = LIBRARY.find((item) => item.command === command);
    if (known) return known.risk;
    return RISKY_PATTERN.test(command) ? "change" : "read";
}

export function commandWarning(command: string): string {
    const known = LIBRARY.find((item) => item.command === command);
    return known?.warning ?? "This command can change files or services on your server. Check it before you run it.";
}

export type Suggestion = {
    command: string;
    explanation: string;
    risk: CommandRisk;
};

const SUGGESTIONS: Array<{ match: RegExp; build: (text: string) => Suggestion }> = [
    {
        match: /memory|ram/,
        build: (text) =>
            /app|container|docker/.test(text)
                ? { command: "docker stats --no-stream --format 'table {{.Name}}\\t{{.MemUsage}}\\t{{.MemPerc}}'", explanation: "Shows memory used by each running app, once. Nothing changes on your server.", risk: "read" }
                : { command: "free -h", explanation: "Shows how much memory is used and free. Nothing changes on your server.", risk: "read" },
    },
    {
        match: /log/,
        build: (text) => {
            const name = text.match(/(?:of|for|from)\s+(?:my\s+|the\s+)?([a-z0-9_-]+)\s+(?:app|logs?)/)?.[1];
            const lines = text.match(/(\d+)\s+lines?/)?.[1] ?? "50";
            return { command: `docker logs --tail ${lines} ${name && name !== "app" ? name : "api"}`, explanation: `Shows the last ${lines} lines of an app's logs. Replace the app name if yours is different.`, risk: "read" };
        },
    },
    { match: /disk|space|storage|full/, build: () => ({ command: "df -h", explanation: "Shows used and free disk space. Nothing changes on your server.", risk: "read" }) },
    { match: /cpu|busy|slow|load/, build: () => ({ command: "top -b -n 1 | head -20", explanation: "Shows the busiest processes right now. Nothing changes on your server.", risk: "read" }) },
    { match: /port/, build: () => ({ command: "ss -lnt", explanation: "Lists the ports your server is listening on. Nothing changes on your server.", risk: "read" }) },
    { match: /restart.*docker|docker.*restart/, build: () => ({ command: "sudo systemctl restart docker", explanation: "Restarts Docker and every app running in it. Apps are down for about 10 seconds.", risk: "change" }) },
    { match: /update|upgrade|patch/, build: () => ({ command: "sudo apt update && sudo apt upgrade -y", explanation: "Installs the latest system updates. This changes your server.", risk: "change" }) },
    { match: /running|containers?|apps?|docker/, build: () => ({ command: "docker ps", explanation: "Lists the apps (containers) running on this server. Nothing changes.", risk: "read" }) },
    { match: /uptime|how long/, build: () => ({ command: "uptime", explanation: "Shows how long the server has been on. Nothing changes.", risk: "read" }) },
    { match: /ip|address/, build: () => ({ command: "curl -s https://ifconfig.me && echo", explanation: "Shows the public address of this server. Nothing changes.", risk: "read" }) },
];

export function suggestCommand(request: string): Suggestion | null {
    const text = request.trim().toLowerCase();
    if (!text) return null;
    for (const entry of SUGGESTIONS) {
        if (entry.match.test(text)) return entry.build(text);
    }
    return null;
}

export type ErrorHelp = { title: string; explanation: string; fix?: string };

const ERROR_HELP: Array<{ match: RegExp; help: ErrorHelp }> = [
    {
        match: /permission denied.*docker|docker.*permission denied|docker\.sock/i,
        help: { title: "What went wrong?", explanation: "This user cannot talk to Docker. Try sudo or ask an admin for access to the Docker group.", fix: "sudo docker ps" },
    },
    {
        match: /command not found/i,
        help: { title: "What went wrong?", explanation: "The server does not know that command. Check the spelling, or the tool may not be installed." },
    },
    {
        match: /no space left on device/i,
        help: { title: "What went wrong?", explanation: "The disk is full. Find what is using the space, then remove files you don't need.", fix: "du -sh * | sort -rh | head -10" },
    },
    {
        match: /permission denied/i,
        help: { title: "What went wrong?", explanation: "You do not have access to do that. Add sudo in front of the command if you are allowed to." },
    },
    {
        match: /no such file or directory/i,
        help: { title: "What went wrong?", explanation: "That file or folder does not exist here. Run ls to see what is in this folder.", fix: "ls -la" },
    },
    {
        match: /connection refused|could not resolve host/i,
        help: { title: "What went wrong?", explanation: "The server could not reach that address. The service may be down, or the address may be wrong." },
    },
];

export function explainError(output: string): ErrorHelp | null {
    for (const entry of ERROR_HELP) {
        if (entry.match.test(output)) return entry.help;
    }
    return null;
}

export const GUIDE_STEPS: Array<{
    id: string;
    title: string;
    summary: string;
    body: string;
    commands?: Array<{ command: string; meaning: string }>;
}> = [
    { id: "what", title: "What is a terminal?", summary: "Give your server written instructions", body: "A terminal lets you type instructions for your server and see the answer. It looks plain, but it is the fastest way to check on your server." },
    { id: "first", title: "Run your first command", summary: "Try a safe command like uptime", body: "Type a command and press Enter. Start with uptime. It only reads information and changes nothing.", commands: [{ command: "uptime", meaning: "How long the server has been on" }] },
    {
        id: "move",
        title: "Move around folders",
        summary: "See your files and find your way",
        body: "Your server stores files in folders, like your computer. These three commands cover most of what you need.",
        commands: [
            { command: "pwd", meaning: "Where am I?" },
            { command: "ls", meaning: "What is here?" },
            { command: "cd logs", meaning: "Open the logs folder" },
        ],
    },
    { id: "output", title: "Read the output", summary: "See what the server is telling you", body: "Normal answers are plain text. Red text or the words error, denied or not found mean something went wrong. Select the text and click Explain to see what it means." },
    { id: "safe", title: "Stay safe", summary: "Double-check commands before running", body: "Commands that update, delete or restart things change your server. Opslin marks them with a Changes your server tag and asks before running. Never paste a command you do not understand." },
];

export const CHEAT_SHEET = ["pwd", "ls -la", "cd ..", "whoami", "uptime", "df -h", "free -h", "docker ps"];
