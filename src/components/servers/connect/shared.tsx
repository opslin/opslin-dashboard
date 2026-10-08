"use client";

import { Check } from "lucide-react";
import { ApiRequestError } from "@/lib/api";
import { cn } from "@/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

/** The same install commands the Servers page has always offered. */
export const INSTALL_COMMANDS = {
    linux: "curl -fsSL https://apis.hotops.sh/opslin/agent/install | sh",
    local: `curl -fsSL ${API_URL}/agent/install/macos | bash`,
} as const;

export type ProviderId = "hostinger" | "digitalocean" | "aws" | "hetzner" | "contabo" | "vultr" | "other";

export interface Provider {
    id: ProviderId;
    label: string;
    /** Colored letter tile (we don't ship third-party logos). */
    initial: string;
    tone: string;
    consoleUrl: string | null;
    consoleLabel: string;
    /** Where to find the browser terminal, for the one-command screen. */
    terminalHint: string;
    usernameHint: string;
    steps: string[];
}

export const PROVIDERS: Provider[] = [
    {
        id: "hostinger",
        label: "Hostinger",
        initial: "H",
        tone: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
        consoleUrl: "https://hpanel.hostinger.com/vps",
        consoleLabel: "Open Hostinger web console",
        terminalHint: "hPanel, then VPS, Manage, Browser terminal",
        usernameHint: "root",
        steps: [
            "Open hPanel and go to **VPS**",
            "Click **Manage** next to your server",
            "Copy the IP address and username",
            "Forgot the password? Use **Change** below **Root password**",
        ],
    },
    {
        id: "digitalocean",
        label: "DigitalOcean",
        initial: "D",
        tone: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
        consoleUrl: "https://cloud.digitalocean.com/droplets",
        consoleLabel: "Open DigitalOcean dashboard",
        terminalHint: "Droplets, your droplet, Console",
        usernameHint: "root",
        steps: [
            "Open **Droplets** in your dashboard",
            "Click your droplet and copy its **IPv4** address",
            "The username is **root**",
            "Use the password you set, or choose SSH key if you added one",
        ],
    },
    {
        id: "aws",
        label: "AWS",
        initial: "A",
        tone: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
        consoleUrl: "https://console.aws.amazon.com/ec2/home#Instances",
        consoleLabel: "Open AWS EC2 console",
        terminalHint: "EC2, Instances, Connect, EC2 Instance Connect",
        usernameHint: "ubuntu",
        steps: [
            "Open **EC2 → Instances** and copy the **Public IPv4** address",
            "The username is usually **ubuntu** (or **ec2-user** on Amazon Linux)",
            "AWS uses a key file: choose **SSH key** and paste your **.pem** file",
            "Make sure the security group allows port **22**",
        ],
    },
    {
        id: "hetzner",
        label: "Hetzner",
        initial: "H",
        tone: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
        consoleUrl: "https://console.hetzner.cloud",
        consoleLabel: "Open Hetzner console",
        terminalHint: "Cloud Console, your server, Console",
        usernameHint: "root",
        steps: [
            "Open your project and click **Servers**",
            "Copy the server's **IP address**",
            "The username is **root**",
            "No password? Use **Rescue → Reset root password**",
        ],
    },
    {
        id: "contabo",
        label: "Contabo",
        initial: "C",
        tone: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
        consoleUrl: "https://my.contabo.com",
        consoleLabel: "Open Contabo panel",
        terminalHint: "Customer panel, VPS, VNC console",
        usernameHint: "root",
        steps: [
            "Open the customer panel and go to **VPS**",
            "Copy the **IP address** of your server",
            "The username is **root**, the password is in your welcome email",
            "Lost it? Reset the password from the server's page",
        ],
    },
    {
        id: "vultr",
        label: "Vultr",
        initial: "V",
        tone: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300",
        consoleUrl: "https://my.vultr.com",
        consoleLabel: "Open Vultr dashboard",
        terminalHint: "Instances, your instance, View Console",
        usernameHint: "root",
        steps: [
            "Open **Instances** and click your server",
            "Copy the **IP address** and **username** (root)",
            "Click the eye icon to reveal the **password**",
            "Using an SSH key instead? Choose **SSH key** below",
        ],
    },
    {
        id: "other",
        label: "Other",
        initial: "•",
        tone: "bg-muted text-muted-foreground",
        consoleUrl: null,
        consoleLabel: "",
        terminalHint: "your provider's dashboard, look for Console or Terminal",
        usernameHint: "root",
        steps: [
            "Open your provider's dashboard and find your server",
            "Copy its **IP address**",
            "The username is usually **root**",
            "Use the password or SSH key your provider gave you",
        ],
    },
];

export function ProviderTile({ provider, className }: { provider: Provider; className?: string }) {
    return (
        <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-bold", provider.tone, className)} aria-hidden="true">
            {provider.initial}
        </span>
    );
}

/** Renders "**bold**" segments in a help step. */
export function RichStep({ text }: { text: string }) {
    return (
        <>
            {text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
                part.startsWith("**") ? <strong key={index} className="font-semibold text-foreground">{part.slice(2, -2)}</strong> : <span key={index}>{part}</span>
            )}
        </>
    );
}

export function ConnectStepper({ step }: { step: 1 | 2 }) {
    return (
        <ol aria-label="Progress" className="flex items-center justify-center gap-3 text-sm">
            <li className="flex items-center gap-2" aria-current={step === 1 ? "step" : undefined}>
                <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                    {step === 2 ? <Check className="size-4" aria-hidden="true" /> : "1"}
                </span>
                <span className={cn("font-medium", step === 1 ? "text-foreground" : "text-muted-foreground")}>Choose</span>
            </li>
            <span className="h-px w-10 bg-border" aria-hidden="true" />
            <li className="flex items-center gap-2" aria-current={step === 2 ? "step" : undefined}>
                <span className={cn("flex size-7 items-center justify-center rounded-full text-xs font-semibold", step === 2 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>2</span>
                <span className={cn("font-medium", step === 2 ? "text-foreground" : "text-muted-foreground")}>Connect</span>
            </li>
        </ol>
    );
}

/** The SSH install endpoints ship with the backend; until then they answer 404/501. */
export function isSshUnavailable(error: unknown) {
    return error instanceof ApiRequestError && (error.status === 404 || error.status === 501);
}

export function errorText(error: unknown, fallback: string) {
    return error instanceof Error && error.message ? error.message : fallback;
}
