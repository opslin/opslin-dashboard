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

/** The install script must run as root. On a non-root login (ubuntu, opc, ec2-user) only the shell after the pipe needs sudo. */
export const INSTALL_COMMAND_SUDO = INSTALL_COMMANDS.linux.replace(/\| sh$/, "| sudo sh");

/**
 * Password / SSH-key install uses `/servers/ssh/*` on the API (built, docs/audit/71 Phase 1), which also
 * needs the `ssh.install` feature override for the organization. Until both are on, the page offers the
 * one-command method first and shows the other as locked. Set NEXT_PUBLIC_SSH_INSTALL=true to show it.
 */
export function sshInstallAvailable() {
    return process.env.NEXT_PUBLIC_SSH_INSTALL === "true";
}

export type ProviderId =
    | "hostinger"
    | "digitalocean"
    | "aws"
    | "oracle"
    | "gcp"
    | "azure"
    | "hetzner"
    | "contabo"
    | "vultr"
    | "linode"
    | "ovh"
    | "scaleway"
    | "other";

export interface Provider {
    id: ProviderId;
    label: string;
    /** Real brand logo in /public/brands/providers (null for "Other"). */
    logo: string | null;
    consoleUrl: string | null;
    consoleLabel: string;
    /** Where to find the browser terminal, for the one-command screen. */
    terminalHint: string;
    /** The login this provider's images usually create. */
    usernameHint: string;
    /** True when the provider gives a key file and no password (so "SSH key" is the only way in). */
    keyOnly: boolean;
    steps: string[];
}

export const PROVIDERS: Provider[] = [
    {
        id: "hostinger",
        label: "Hostinger",
        logo: "/brands/providers/hostinger.svg",
        consoleUrl: "https://hpanel.hostinger.com/vps",
        consoleLabel: "Open Hostinger web console",
        terminalHint: "hPanel, then VPS, Manage, Browser terminal",
        usernameHint: "root",
        keyOnly: false,
        steps: [
            "Open hPanel and go to **VPS**",
            "Click **Manage** next to your server",
            "Copy the IP address. The username is **root**",
            "Forgot the password? Use **Change** below **Root password**",
        ],
    },
    {
        id: "digitalocean",
        label: "DigitalOcean",
        logo: "/brands/providers/digitalocean.svg",
        consoleUrl: "https://cloud.digitalocean.com/droplets",
        consoleLabel: "Open DigitalOcean dashboard",
        terminalHint: "Droplets, your droplet, Console",
        usernameHint: "root",
        keyOnly: false,
        steps: [
            "Open **Droplets** in your dashboard",
            "Click your droplet and copy its **IPv4** address",
            "The username is **root**",
            "Use the password from your email, or the key you added when you created it",
        ],
    },
    {
        id: "aws",
        label: "AWS",
        logo: "/brands/providers/aws.svg",
        consoleUrl: "https://console.aws.amazon.com/ec2/home#Instances",
        consoleLabel: "Open AWS EC2 console",
        terminalHint: "EC2, Instances, Connect, EC2 Instance Connect",
        usernameHint: "ubuntu",
        keyOnly: true,
        steps: [
            "Open **EC2 → Instances** and copy the **Public IPv4** address",
            "The username is **ubuntu** (or **ec2-user** on Amazon Linux)",
            "AWS has no password. You log in with the **.pem** key file from when you launched it",
            "Lost the file? Click **Connect → EC2 Instance Connect** to open a terminal in the browser",
            "Make sure the security group allows port **22**",
        ],
    },
    {
        id: "oracle",
        label: "Oracle Cloud",
        logo: "/brands/providers/oracle.svg",
        consoleUrl: "https://cloud.oracle.com/compute/instances",
        consoleLabel: "Open Oracle Cloud instances",
        terminalHint: "Compute, Instances, your instance, Console connection",
        usernameHint: "opc",
        keyOnly: true,
        steps: [
            "Open **Compute → Instances** and copy the **Public IP address**",
            "The username is **opc** on Oracle Linux, or **ubuntu** on Ubuntu images",
            "Oracle has no password and blocks root login. You log in with the private key you downloaded when you created the instance",
            "No key? Open your instance, then **Console connection**, to add or reset it",
            "Open port **22** in the instance's **Security List** (the server's own firewall is on too)",
        ],
    },
    {
        id: "gcp",
        label: "Google Cloud",
        logo: "/brands/providers/gcp.svg",
        consoleUrl: "https://console.cloud.google.com/compute/instances",
        consoleLabel: "Open Compute Engine",
        terminalHint: "Compute Engine, VM instances, SSH",
        usernameHint: "your Google username",
        keyOnly: true,
        steps: [
            "Open **Compute Engine → VM instances** and copy the **External IP**",
            "There is no root login and no password",
            "Click **SSH** next to your VM to open a terminal in the browser",
            "Run the install command with **sudo**",
        ],
    },
    {
        id: "azure",
        label: "Azure",
        logo: "/brands/providers/azure.svg",
        consoleUrl: "https://portal.azure.com/#view/HubsExtension/BrowseResource/resourceType/Microsoft.Compute%2FVirtualMachines",
        consoleLabel: "Open Azure virtual machines",
        terminalHint: "Virtual machines, your VM, Help, Serial console",
        usernameHint: "azureuser",
        keyOnly: false,
        steps: [
            "Open **Virtual machines**, click your VM and copy its **Public IP address**",
            "The username is the one you chose at creation (often **azureuser**), not root",
            "Use the password or key you set when you created it",
            "Allow port **22** in the VM's **Networking** tab",
        ],
    },
    {
        id: "hetzner",
        label: "Hetzner",
        logo: "/brands/providers/hetzner.svg",
        consoleUrl: "https://console.hetzner.cloud",
        consoleLabel: "Open Hetzner console",
        terminalHint: "Cloud Console, your server, Console",
        usernameHint: "root",
        keyOnly: false,
        steps: [
            "Open your project and click **Servers**",
            "Copy the server's **IP address**. The username is **root**",
            "Use the password from your email, or the key you added when you created it",
            "No password? Use **Rescue → Reset root password**",
        ],
    },
    {
        id: "contabo",
        label: "Contabo",
        logo: "/brands/providers/contabo.svg",
        consoleUrl: "https://my.contabo.com",
        consoleLabel: "Open Contabo panel",
        terminalHint: "Customer panel, VPS, VNC console",
        usernameHint: "root",
        keyOnly: false,
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
        logo: "/brands/providers/vultr.svg",
        consoleUrl: "https://my.vultr.com",
        consoleLabel: "Open Vultr dashboard",
        terminalHint: "Instances, your instance, View Console",
        usernameHint: "root",
        keyOnly: false,
        steps: [
            "Open **Instances** and click your server",
            "Copy the **IP address**. The username is **root**",
            "Click the eye icon to reveal the **password**",
            "Using an SSH key instead? Choose **SSH key**",
        ],
    },
    {
        id: "linode",
        label: "Linode",
        logo: "/brands/providers/linode.svg",
        consoleUrl: "https://cloud.linode.com/linodes",
        consoleLabel: "Open Linode Cloud Manager",
        terminalHint: "Linodes, your Linode, Launch LISH Console",
        usernameHint: "root",
        keyOnly: false,
        steps: [
            "Open **Linodes** and click your server",
            "Copy the **IP address**. The username is **root**",
            "Use the root password you set when you created it",
            "Locked out? **Launch LISH Console** opens a terminal in the browser",
        ],
    },
    {
        id: "ovh",
        label: "OVHcloud",
        logo: "/brands/providers/ovh.svg",
        consoleUrl: "https://www.ovh.com/manager/",
        consoleLabel: "Open OVHcloud manager",
        terminalHint: "Your VPS, KVM",
        usernameHint: "root",
        keyOnly: false,
        steps: [
            "Open your **VPS** in the OVHcloud manager and copy its **IP address**",
            "The username is in the install email. It is root on some images and ubuntu or debian on others",
            "Look for **KVM** on the server's page to open a terminal in the browser",
        ],
    },
    {
        id: "scaleway",
        label: "Scaleway",
        logo: "/brands/providers/scaleway.svg",
        consoleUrl: "https://console.scaleway.com/instance/servers",
        consoleLabel: "Open Scaleway console",
        terminalHint: "Instances, your instance, Console",
        usernameHint: "root",
        keyOnly: true,
        steps: [
            "Open **Instances** and copy the server's **Public IP**",
            "The username is **root**",
            "Scaleway logs you in with the SSH key you added in your account",
            "No key? Open the server's **Console** to get a terminal in the browser",
        ],
    },
    {
        id: "other",
        label: "Other",
        logo: null,
        consoleUrl: null,
        consoleLabel: "",
        terminalHint: "your provider's dashboard, look for Console or Terminal",
        usernameHint: "root",
        keyOnly: false,
        steps: [
            "Open your provider's dashboard and find your server",
            "Copy its **IP address**",
            "The username is usually **root**",
            "Use the password or SSH key your provider gave you",
        ],
    },
];

/** The login line a person types on their own computer when their provider has no web console. */
export function sshLine(provider: Provider) {
    const user = provider.usernameHint.includes(" ") ? "YOUR_USERNAME" : provider.usernameHint;
    return `ssh ${provider.keyOnly ? "-i path/to/your-key " : ""}${user}@YOUR_SERVER_IP`;
}

/** True when the usual login for this provider is not root, so the install needs sudo. */
export function needsSudo(provider: Provider) {
    return provider.usernameHint !== "root";
}

export function ProviderTile({ provider, className }: { provider: Provider; className?: string }) {
    return (
        <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md border border-border/60 bg-white text-xs font-bold text-neutral-500", className)} aria-hidden="true">
            {provider.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={provider.logo} alt="" className="size-[70%] object-contain" />
            ) : (
                "•"
            )}
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

/** The SSH install endpoints answer 404/501 where they are not deployed and 403 `feature_disabled` where the workspace is not opted in. */
export function isSshUnavailable(error: unknown) {
    if (!(error instanceof ApiRequestError)) return false;
    return error.status === 404 || error.status === 501 || (error.status === 403 && error.details?.code === "feature_disabled");
}

export function errorText(error: unknown, fallback: string) {
    return error instanceof Error && error.message ? error.message : fallback;
}
