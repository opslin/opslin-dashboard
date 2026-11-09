"use client";

import { BookOpen, ChevronRight, Cloud, KeyRound, Lock, SquareTerminal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { cloudInstallAvailable, ConnectStepper, PROVIDERS, ProviderTile, sshInstallAvailable } from "./shared";

type Method = "ssh" | "command" | "guide" | "aws";

function MethodCard({ icon: Icon, title, description, badge, highlighted, onClick, testId }: { icon: typeof KeyRound; title: string; description: string; badge?: string; highlighted?: boolean; onClick: () => void; testId: string }) {
    return (
        <button
            type="button"
            data-testid={testId}
            onClick={onClick}
            className={cn(
                "group flex w-full items-center gap-5 rounded-2xl border bg-card px-6 py-5 text-left shadow-xs transition-all hover:border-primary/50 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring",
                highlighted && "border-primary/40 bg-primary/[0.05]"
            )}
        >
            <span className={cn("flex size-14 shrink-0 items-center justify-center rounded-full", highlighted ? "bg-primary/10 text-primary" : "bg-muted text-foreground")}>
                <Icon className="size-6" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-semibold text-foreground">{title}</span>
                    {badge ? <Badge variant="secondary" className="border border-primary/30 bg-background text-primary">{badge}</Badge> : null}
                </span>
                <span className="mt-0.5 block text-[15px] text-muted-foreground">{description}</span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </button>
    );
}

/** Shown in place of a method that can't be used yet: visible, locked, and says why. */
function LockedMethodCard({ icon: Icon, title, description, testId }: { icon: typeof KeyRound; title: string; description: string; testId: string }) {
    return (
        <div data-testid={testId} aria-disabled="true" className="flex w-full items-center gap-5 rounded-2xl border border-dashed bg-card px-6 py-5 opacity-70">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Icon className="size-6" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-semibold text-foreground">{title}</span>
                    <Badge variant="secondary" className="gap-1 border bg-background text-muted-foreground">
                        <Lock className="size-3" aria-hidden="true" />
                        Coming soon
                    </Badge>
                </span>
                <span className="mt-0.5 block text-[15px] text-muted-foreground">{description}</span>
            </span>
        </div>
    );
}

export function ChooseMethod({ onChoose }: { onChoose: (method: Method) => void }) {
    const sshAvailable = sshInstallAvailable();
    return (
        <div className="space-y-8">
            <ConnectStepper step={1} />
            <div className="space-y-3 text-center">
                <h1 className="text-4xl font-bold tracking-tight text-foreground">Connect your server</h1>
                <p className="text-lg text-muted-foreground">Any VPS works: Hostinger, AWS, Oracle Cloud, DigitalOcean, Hetzner. It takes about 2 minutes.</p>
            </div>

            <div className="space-y-4">
                {sshAvailable ? (
                    <MethodCard
                        testId="method-ssh"
                        icon={KeyRound}
                        highlighted
                        badge="Easiest"
                        title="Connect with password or SSH key"
                        description="Enter your server's IP and login. Opslin installs everything for you."
                        onClick={() => onChoose("ssh")}
                    />
                ) : null}
                <MethodCard
                    testId="method-command"
                    icon={SquareTerminal}
                    highlighted={!sshAvailable}
                    badge={sshAvailable ? undefined : "Easiest"}
                    title="Run one command"
                    description="Paste a single command in your server's terminal. No password is shared with Opslin."
                    onClick={() => onChoose("command")}
                />
                {sshAvailable ? null : (
                    <LockedMethodCard testId="method-ssh-locked" icon={KeyRound} title="Connect with password or SSH key" description="Opslin logs in once and installs everything for you." />
                )}
                {cloudInstallAvailable() ? (
                    <MethodCard
                        testId="method-aws"
                        icon={Cloud}
                        title="Connect an AWS server with your AWS account"
                        description="No key file needed. Opslin uses a temporary key or Session Manager."
                        onClick={() => onChoose("aws")}
                    />
                ) : null}
                <MethodCard
                    testId="method-guide"
                    icon={BookOpen}
                    title="Not sure where to find your details?"
                    description="Step-by-step guides for Hostinger, AWS, Oracle Cloud and more."
                    onClick={() => onChoose("guide")}
                />
            </div>

            <ul className="flex flex-wrap justify-center gap-3" aria-label="Supported providers">
                {PROVIDERS.map((provider) => (
                    <li key={provider.id} className="flex items-center gap-2 rounded-xl border bg-card px-3.5 py-2 text-sm font-medium text-foreground shadow-xs">
                        <ProviderTile provider={provider} />
                        {provider.label}
                    </li>
                ))}
            </ul>

            <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Lock className="size-4" aria-hidden="true" />
                {sshAvailable ? "Your password is used once to set things up and is never saved." : "The Opslin agent connects out from your server. No inbound port stays open."}
            </p>
        </div>
    );
}
