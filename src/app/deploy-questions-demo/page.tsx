"use client";

import { useState } from "react";
import { notFound } from "next/navigation";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CirclePause } from "lucide-react";
import { DeployQuestions, InvestigationSteps } from "@/components/apps/DeployInvestigation";
import type { DilRunQuestion, DilRunStep } from "@/lib/api";

// API doc 80: a no-login preview of the paused-deploy questions and the investigation steps, for looking at light, dark
// and phone. Not part of the product: it answers 404 in production. Nothing typed here is sent anywhere.
const QUESTIONS: DilRunQuestion[] = [
    {
        id: "STRIPE_SECRET_KEY", kind: "secret", title: "STRIPE_SECRET_KEY (payments)",
        body: "What it is for: takes card payments at checkout\nWhere to get it: Stripe dashboard, Developers, API keys\nWhy Opslin asks: src/config.ts:14 stops the app when it is missing\nThis value is given to this app's own code on your server. Opslin stores it encrypted and never shows it again.",
    },
    { id: "FIRST_SUPERUSER", kind: "secret", title: "FIRST_SUPERUSER", body: "What it is for: the e-mail address of the first admin account, used to sign in\nWhere to get it: choose the address you want to sign in with\nWhy Opslin asks: backend/app/core/config.py line 65 requires it" },
    { id: "FIRST_SUPERUSER_PASSWORD", kind: "secret", title: "FIRST_SUPERUSER_PASSWORD", body: "What it is for: the password of the first admin account\nWhere to get it: type your own, or generate one below\nWhy Opslin asks: config.py lines 84-86 reject the default password" },
    { id: "which-app", kind: "decision", title: "Which app should be the public site?", body: "Why Opslin asks: apps/web and apps/admin both start a web server", options: ["apps/web", "apps/admin"] },
];
const STEPS: DilRunStep[] = [
    { kind: "agent_step", at: "", note: "The first attempt stopped at start; reading the server entry file.", action: "repo_read src/server.ts" },
    { kind: "agent_step", at: "", note: "The app signs sessions with SESSION_SECRET and exits when it is unset.", action: "repo_search \"SESSION_SECRET\"" },
    { kind: "agent_plan", at: "", reason: "The session secret is only checked by the app itself, so Opslin can make it.", changes: ["SESSION_SECRET: generate", "readiness of \".\": http at /healthz"] },
    { kind: "agent_exec", at: "", finished: true, verified: false, stage: "checks" },
    { kind: "agent_step", at: "", note: "The home page answers 500: the template reads a table that does not exist yet.", action: "http_probe GET /" },
    { kind: "agent_plan", at: "", reason: "The repository has migrations that were never run.", changes: ["schema command for \".\": npx prisma migrate deploy"] },
    { kind: "agent_exec", at: "", finished: true, verified: true },
    { kind: "agent_outcome", at: "", outcome: "live", level: 4 },
];

export default function DeployQuestionsDemoPage() {
    if (process.env.NODE_ENV === "production") notFound();
    const { resolvedTheme, setTheme } = useTheme();
    const [sent, setSent] = useState<string | null>(null);
    const [open, setOpen] = useState(true);
    return (
        <main className="mx-auto flex max-w-lg flex-col gap-4 p-6">
            <div className="flex items-center justify-between">
                <h1 className="text-lg font-semibold">Paused deploy preview</h1>
                <div className="flex gap-2">
                    <Button size="sm" onClick={() => setOpen(true)}>Open dialog</Button>
                    <Button size="sm" variant="outline" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>Switch theme</Button>
                </div>
            </div>
            {sent ? <p className="text-xs text-muted-foreground">Would send: {sent}</p> : null}
            {/* The same frame as the real "Deploy progress" dialog (components/apps/DeployProgressDialog.tsx). */}
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="flex max-h-[min(92dvh,50rem)] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
                    <DialogHeader className="shrink-0 gap-1 border-b border-border px-5 py-4 pr-14 text-left sm:px-6 sm:pr-14">
                        <DialogTitle className="flex items-center gap-2"><CirclePause className="size-4 text-muted-foreground" />Deploy progress</DialogTitle>
                        <DialogDescription>AI-assisted deploy for full-stack-fastapi-template.</DialogDescription>
                    </DialogHeader>
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
                        <div className="flex flex-col gap-4">
                            <DeployQuestions questions={QUESTIONS} submitting={false} error={null} onCancel={() => setOpen(false)} onSubmit={(answers) => setSent(`${Object.keys(answers.settings).length} setting(s), ${Object.keys(answers.decisions).length} decision(s)`)} />
                            <InvestigationSteps steps={STEPS} defaultOpen />
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </main>
    );
}
