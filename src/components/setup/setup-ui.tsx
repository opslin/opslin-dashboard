"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, BookOpen, Check, Eye, GitBranch, Lock, Plug, RefreshCw, Rocket, Server as ServerIcon, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { SetupStepId } from "./use-setup";

const PREFIX = "opslin-setup-";

function readFlag(key: string) {
    if (typeof window === "undefined") return false;
    try {
        return window.localStorage.getItem(PREFIX + key) === "1";
    } catch {
        return false;
    }
}

function writeFlag(key: string) {
    try {
        window.localStorage.setItem(PREFIX + key, "1");
    } catch {
        // Storage can be blocked. The prompt just comes back next time.
    }
}

export function useFlag(key: string): [boolean, () => void] {
    const [value, setValue] = useState(() => readFlag(key));
    return [
        value,
        () => {
            writeFlag(key);
            setValue(true);
        },
    ];
}

export function ExampleDataBadge() {
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/60 px-2.5 py-1 text-xs font-medium text-muted-foreground">
            <Eye className="size-3.5" aria-hidden="true" />
            Example data
        </span>
    );
}

/** The one slim prompt a server page shows. It shrinks to a small chip once it is dismissed. */
export function SetupBanner({ id }: { id: string }) {
    const [dismissed, dismiss] = useFlag(`banner-${id}`);
    if (dismissed) {
        return (
            <div className="flex justify-end">
                <Link href="/servers/connect" className="inline-flex h-7 items-center gap-1.5 rounded-full border bg-card px-3 text-xs font-medium text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
                    <Plug className="size-3.5" aria-hidden="true" />
                    Connect a server
                </Link>
            </div>
        );
    }
    return (
        <div role="region" aria-label="Connect a server" className="flex flex-wrap items-center gap-4 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Plug className="size-5" aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">Connect a server to see your own data</p>
                <p className="text-xs text-muted-foreground">Takes about 2 minutes.</p>
            </div>
            <Button asChild><Link href="/servers/connect"><ServerIcon aria-hidden="true" />Connect server</Link></Button>
            <button type="button" onClick={dismiss} className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring">Dismiss</button>
        </div>
    );
}

export function PreviewFrame({ id, children }: { id: string; children: React.ReactNode }) {
    return (
        <div className="space-y-4">
            <SetupBanner id={id} />
            <div inert aria-hidden="true" className="pointer-events-none select-none opacity-60">{children}</div>
            <p className="text-xs text-muted-foreground">Preview with example data</p>
        </div>
    );
}

/** A full page for something that needs a server: the real layout with example data and one banner. */
export function NoServerPage({ id, title, subtitle, action, children }: { id: string; title: string; subtitle: string; action?: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="dashboard-page">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <div className="flex flex-wrap items-center gap-3">
                        <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
                        <ExampleDataBadge />
                    </div>
                    <p className="mt-1 text-muted-foreground">{subtitle}</p>
                </div>
                {action ? <div inert aria-hidden="true" className="pointer-events-none opacity-50">{action}</div> : null}
            </div>
            <PreviewFrame id={id}>{children}</PreviewFrame>
        </div>
    );
}

// ── Get started ─────────────────────────────────────────────────────────

function Ring({ done, total }: { done: number; total: number }) {
    const radius = 62;
    const circumference = 2 * Math.PI * radius;
    return (
        <div className="relative size-40 shrink-0" role="img" aria-label={`${done} of ${total} steps complete`}>
            <svg viewBox="0 0 150 150" className="size-full -rotate-90">
                <circle cx="75" cy="75" r={radius} fill="none" stroke="var(--muted)" strokeWidth="9" />
                {done > 0 ? <circle cx="75" cy="75" r={radius} fill="none" stroke="var(--opslin-info-default)" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(done / total) * circumference} ${circumference}`} /> : null}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-3xl font-bold tabular-nums text-foreground">{done} <span className="text-lg font-medium text-muted-foreground">of</span> {total}</p>
                <p className="text-xs text-muted-foreground">steps {done === 0 ? "complete" : "completed"}</p>
            </div>
        </div>
    );
}

type StepView = { id: SetupStepId; done: boolean };

const STEP_COPY: Record<SetupStepId, { title: string; text: string }> = {
    server: { title: "Connect a server", text: "Link a VPS so Opslin can run your apps." },
    github: { title: "Connect GitHub", text: "So we can build from your code." },
    app: { title: "Deploy your first app", text: "Pick a repo and go live." },
};

export function SetupChecklistCard({ steps, done, current, serverName, appCount, onSkip }: { steps: StepView[]; done: number; current: SetupStepId | null; serverName: string; appCount: number; onSkip: () => void }) {
    const note = done === 1 ? "Your server is ready. Let's deploy your first app." : done === 2 ? "GitHub is connected. One step left." : "";
    return (
        <Card className="gap-0 rounded-2xl p-6 shadow-xs">
            <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Your setup</p>
                    <h2 className="text-2xl font-bold tracking-tight text-foreground">Get started</h2>
                    <div className="mt-4 flex flex-col items-center lg:items-start"><Ring done={done} total={steps.length} /></div>
                    {note ? <p className="mt-3 text-sm text-muted-foreground">{note}</p> : null}
                </div>
                <div className="flex min-w-0 flex-col">
                    <ol className="divide-y">
                        {steps.map((step, index) => {
                            const copy = STEP_COPY[step.id];
                            const isCurrent = step.id === current;
                            const locked = !step.done && !isCurrent;
                            const previous = index > 0 ? index : 0;
                            return (
                                <li key={step.id} className="flex flex-wrap items-center gap-4 py-4 first:pt-1">
                                    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold", step.done ? "bg-success text-white" : isCurrent ? "bg-primary text-primary-foreground" : "border bg-background text-muted-foreground")}>
                                        {step.done ? <Check className="size-4" aria-hidden="true" /> : index + 1}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="font-semibold text-foreground">{copy.title}</p>
                                        <p className="text-sm text-muted-foreground">{step.done && step.id === "server" ? `${serverName} · Connected` : step.done && step.id === "app" ? `${appCount} ${appCount === 1 ? "app" : "apps"} deployed` : step.done ? "Connected" : copy.text}</p>
                                    </div>
                                    {isCurrent ? (
                                        <div className="flex items-center gap-4">
                                            {step.id === "server" ? (
                                                <>
                                                    <Button asChild size="lg"><Link href="/servers/connect"><ServerIcon aria-hidden="true" />Connect server</Link></Button>
                                                    <Link href="/docs/deploy-first-app" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring">How it works<ArrowRight className="size-3.5" aria-hidden="true" /></Link>
                                                </>
                                            ) : step.id === "github" ? (
                                                <Button asChild size="lg"><Link href="/apps/new"><GitBranch aria-hidden="true" />Connect GitHub</Link></Button>
                                            ) : (
                                                <Button asChild size="lg"><Link href="/apps/new"><Rocket aria-hidden="true" />Deploy app</Link></Button>
                                            )}
                                        </div>
                                    ) : locked ? (
                                        <div className="flex items-center gap-4 text-muted-foreground">
                                            <span className="inline-flex h-11 items-center gap-2 rounded-lg border bg-muted/40 px-4 text-sm font-medium opacity-70" aria-hidden="true">
                                                {step.id === "github" ? <GitBranch className="size-4" /> : <Rocket className="size-4" />}
                                                {step.id === "github" ? "Connect GitHub" : "Deploy app"}
                                            </span>
                                            <span className="inline-flex items-center gap-1.5 text-sm"><Lock className="size-3.5" aria-hidden="true" />After step {previous}</span>
                                        </div>
                                    ) : null}
                                </li>
                            );
                        })}
                    </ol>
                    <div className="mt-auto flex justify-end pt-2">
                        <Button variant="outline" onClick={onSkip}>Skip for now</Button>
                    </div>
                </div>
            </div>
        </Card>
    );
}

export function ConnectedBanner({ serverName, onClose }: { serverName: string; onClose: () => void }) {
    return (
        <div role="status" className="flex flex-wrap items-center gap-4 rounded-xl border border-success/30 bg-success-muted px-4 py-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-success text-white"><Check className="size-5" aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{serverName} is connected.</p>
                <p className="text-xs text-muted-foreground">Next: deploy your first app.</p>
            </div>
            <Button asChild><Link href="/apps/new"><Rocket aria-hidden="true" />Deploy an app</Link></Button>
            <button type="button" onClick={onClose} aria-label="Dismiss" className="rounded-md p-1.5 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"><X className="size-4" aria-hidden="true" /></button>
        </div>
    );
}

function Mini({ children }: { children: React.ReactNode }) {
    return <div aria-hidden="true" className="mt-4 overflow-hidden rounded-xl border bg-background p-3 text-xs">{children}</div>;
}

function Wave({ color }: { color: string }) {
    return (
        <svg viewBox="0 0 120 24" preserveAspectRatio="none" className="h-6 w-full">
            <path d="M0 16 C10 6, 18 20, 30 12 S50 4, 62 14 S84 20, 96 8 S112 10, 120 6" fill="none" stroke={color} strokeWidth="1.5" />
        </svg>
    );
}

function Benefit({ icon: Icon, tone, title, text, children }: { icon: LucideIcon; tone: string; title: string; text: string; children: React.ReactNode }) {
    return (
        <Card className="gap-0 rounded-2xl p-5 shadow-xs">
            <div className="flex items-start gap-3">
                <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", tone)}><Icon className="size-5" aria-hidden="true" /></span>
                <div><h3 className="font-bold text-foreground">{title}</h3><p className="text-sm text-muted-foreground">{text}</p></div>
            </div>
            {children}
        </Card>
    );
}

export function WhatYoullGet() {
    return (
        <section aria-label="What you'll get" className="space-y-3">
            <h2 className="text-xl font-bold text-foreground">What you&apos;ll get</h2>
            <div className="grid gap-5 lg:grid-cols-3">
                <Benefit icon={ServerIcon} tone="bg-info-muted text-info-text" title="Live monitoring" text="See CPU, memory, disk and more in one simple view.">
                    <Mini>
                        <div className="grid grid-cols-4 gap-2">
                            {[["CPU", "23%", "var(--opslin-info-default)"], ["Memory", "1.6 GB", "var(--opslin-chart-violet)"], ["Disk", "18 GB", "var(--opslin-warning-default)"], ["Network", "12.4 MB/s", "var(--opslin-success-default)"]].map(([label, value, color]) => (
                                <div key={label}><p className="text-[10px] text-muted-foreground">{label}</p><p className="font-bold text-foreground">{value}</p><Wave color={color} /></div>
                            ))}
                        </div>
                    </Mini>
                </Benefit>
                <Benefit icon={Rocket} tone="bg-chart-violet/10 text-chart-violet-text" title="One-click deploys" text="Push code, we do the rest. No complex setup.">
                    <Mini>
                        <p className="mb-2 flex justify-between font-semibold text-foreground"><span>Deploying...</span><span className="font-normal text-muted-foreground">1m 12s</span></p>
                        <ul className="space-y-1.5">
                            {[["Building your app", true], ["Installing dependencies", true], ["Starting your app", false], ["Going live", false]].map(([label, ok]) => (
                                <li key={String(label)} className="flex items-center gap-2"><span className={cn("flex size-4 items-center justify-center rounded-full", ok ? "bg-success text-white" : "border")}>{ok ? <Check className="size-3" /> : null}</span><span className={ok ? "text-foreground" : "text-muted-foreground"}>{String(label)}</span></li>
                            ))}
                        </ul>
                    </Mini>
                </Benefit>
                <Benefit icon={RefreshCw} tone="bg-success-muted text-success-text" title="Safe roll backs" text="Something not right? Return to a good version anytime.">
                    <Mini>
                        <ul className="space-y-1.5">
                            {[["Live", "a1b2c3d", "2 hours ago", true], ["Failed", "f9e8d7c", "1 day ago", false], ["Live", "3c4d5e6", "3 days ago", true]].map(([status, sha, ago, ok]) => (
                                <li key={String(sha)} className="flex items-center gap-2"><span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", ok ? "bg-success-muted text-success-text" : "bg-danger-muted text-danger-text")}>{String(status)}</span><code className="font-mono">{String(sha)}</code><span className="ml-auto text-muted-foreground">{String(ago)}</span></li>
                            ))}
                        </ul>
                    </Mini>
                </Benefit>
            </div>
        </section>
    );
}

export function HelpStrip() {
    return (
        <Card className="flex-row flex-wrap items-center gap-4 rounded-2xl p-5 shadow-xs">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><BookOpen className="size-5" aria-hidden="true" /></span>
            <div className="min-w-0 flex-1"><p className="font-bold text-foreground">Need help?</p><p className="text-sm text-muted-foreground">Read our 5 minute guide to get your first app live.</p></div>
            <Button asChild variant="outline"><Link href="/docs/deploy-first-app">Read the guide<ArrowRight aria-hidden="true" /></Link></Button>
            <Button asChild variant="outline"><Link href="/docs/connect-github">Connect GitHub help<ArrowRight aria-hidden="true" /></Link></Button>
        </Card>
    );
}

// ── Create app / Create database with no server ────────────────────────

export function NoServerFlow({ kind }: { kind: "app" | "database" }) {
    const app = kind === "app";
    const stepper = app ? ["Server", "Code", "Review"] : ["Server", "Configure", "Review"];
    const later = app
        ? [{ icon: GitBranch, title: "Add your code", text: "Connect a GitHub repo or upload your code." }, { icon: Rocket, title: "Review and deploy", text: "Review settings and launch your app." }]
        : [{ icon: Eye, title: "Configure database", text: "Choose engine, region and settings." }, { icon: Check, title: "Review and create", text: "Review settings and create your database." }];
    return (
        <div className="dashboard-page">
            <div className="mx-auto w-full max-w-3xl space-y-6">
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{app ? "Apps" : "Databases"}</p>
                    <h1 className="mt-1 text-4xl font-bold tracking-tight text-foreground">{app ? "Deploy new app" : "Create database"}</h1>
                    <p className="mt-1 text-muted-foreground">{app ? "Get your app live in a few minutes." : "Set up a production-ready database."}</p>
                </div>
                <ol className="flex items-start" aria-label="Steps">
                    {stepper.map((label, index) => (
                        <li key={label} className={cn("flex flex-col items-start gap-1.5 text-sm", index < stepper.length - 1 ? "flex-1" : "")}>
                            <span className="flex w-full items-center gap-2">
                                <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold", index === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")} aria-current={index === 0 ? "step" : undefined}>{index + 1}</span>
                                {index < stepper.length - 1 ? <span className="h-px flex-1 bg-border" aria-hidden="true" /> : null}
                            </span>
                            <span className={cn(index === 0 ? "font-semibold text-foreground" : "text-muted-foreground")}>{label}</span>
                        </li>
                    ))}
                </ol>
                <Card className="items-center gap-0 rounded-2xl p-10 text-center shadow-xs">
                    <span className="flex size-20 items-center justify-center rounded-full bg-primary/10 text-primary"><ServerIcon className="size-9" aria-hidden="true" /></span>
                    <h2 className="mt-5 text-2xl font-bold text-foreground">{app ? "First, connect a server" : "Pick where your database lives"}</h2>
                    <p className="mt-2 max-w-sm text-muted-foreground">{app ? "Your app needs a place to run. This takes about 2 minutes." : "A server is required to run your database. This takes about 2 minutes."}</p>
                    <Button asChild size="lg" className="mt-6 h-12 w-full max-w-md text-base"><Link href="/servers/connect"><ServerIcon aria-hidden="true" />Connect server</Link></Button>
                    <Link href="/overview" className="mt-4 text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring">I&apos;ll do this later</Link>
                </Card>
                {later.map((item, index) => (
                    <div key={item.title} className="flex items-center gap-4 rounded-2xl border bg-card/60 p-5 opacity-70" aria-hidden="true">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-muted-foreground">{index + 2}</span>
                        <item.icon className="size-5 text-muted-foreground" />
                        <div className="min-w-0 flex-1"><p className="font-semibold text-foreground">{item.title}</p><p className="text-sm text-muted-foreground">{item.text}</p></div>
                        <span className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs text-muted-foreground"><Lock className="size-3" />Soon</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
