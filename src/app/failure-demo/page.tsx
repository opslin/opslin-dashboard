"use client";

import { useState } from "react";
import { notFound } from "next/navigation";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { FailureReportDialog } from "@/components/deploy/failure-report-dialog";
import { parseFailureReport } from "@/lib/failure-report";

// Doc 75 M6: a no-login preview of the failure dialog with the real reports of 9 Nov 2026, for looking at light, dark and phone.
// Not part of the product: it answers 404 in production.
const base = { version: 1, stage: "verify", opslinDid: [] as string[], nextSteps: [] as string[], technical: "" };
const REPORTS = {
  "Missing setting (ShotlinCRM)": {
    ...base, cause: "missing_settings", outcome: "needs_configuration",
    title: "This app needs one setting before it can start: WHATSAPP_AUTH_MASTER_KEY",
    summary: "The app itself reported these settings as missing, so it cannot run until you give them. Opslin cannot make up a secret for you.",
    resume: { serverId: "srv-demo", appId: "app-demo" },
    missing: [{ kind: "setting", name: "WHATSAPP_AUTH_MASTER_KEY", why: "Not set, and the app stops at start without it.", foundIn: "src/server/env.ts", howToFix: "Add it under the app's Environment settings, then deploy again." }],
    appSaid: "Invalid environment configuration: WHATSAPP_AUTH_MASTER_KEY",
    opslinDid: ["Opslin tried 2 automatic fixes. They could not help, because the cause is not something a code change can supply."],
    nextSteps: ["Open the app's Environment settings and fix the setting(s) listed above.", "Press Deploy again (or restart the app)."],
    technical: "⨯ Error: Invalid environment configuration: WHATSAPP_AUTH_MASTER_KEY\n    at getEnv (/app/src/server/env.ts:33:11)\n    at <anonymous> (/app/src/server/db/client.ts:13:23)",
  },
  "Missing file (Drizzle journal)": {
    ...base, stage: "migration", cause: "migration_blocked", outcome: "application_defect",
    title: "The database migration cannot run: drizzle/meta/_journal.json is missing from the repository",
    summary: "Nothing was created. The migration files are in the repository but the journal that lists them is not.",
    missing: [{ kind: "file", name: "drizzle/meta/_journal.json", why: "Drizzle needs this journal to apply the migration files; without it no tool can run them.", foundIn: ".gitignore", howToFix: "Add the folder to the repository (remove it from .gitignore), commit it and push." }],
    appSaid: "This repository has 16 SQL migration files in drizzle/ but not drizzle/meta/_journal.json",
    nextSteps: ["Remove the line that hides the folder from .gitignore.", "Commit and push the folder, then deploy again.", "Or choose \"Don't run a migration\" if you load your own data."],
    technical: "the app: Opslin did not start: the database migration cannot run. Nothing was created.",
  },
  "Opslin's side (no missing items)": {
    ...base, stage: "plan", cause: "ai_output_invalid", outcome: "opslin_defect",
    title: "Opslin could not finish this deploy",
    summary: "This is a problem on Opslin's side, not in your project. Nothing in your project needs to change.",
    missing: [], appSaid: "AI response did not start with a valid Dockerfile FROM instruction",
    nextSteps: ["Try the deploy again.", "If it fails the same way, send the technical details below to Opslin support."],
    technical: "the app: Opslin could not get a Dockerfile written by the AI (AI response did not start with a valid Dockerfile FROM instruction)",
  },
} as const;

export default function FailureDemoPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const names = Object.keys(REPORTS) as Array<keyof typeof REPORTS>;
  const [pick, setPick] = useState<keyof typeof REPORTS>(names[0]!);
  const [open, setOpen] = useState(true);
  const { resolvedTheme, setTheme } = useTheme();
  const report = parseFailureReport(REPORTS[pick])!;
  return (
    <main className="mx-auto max-w-xl space-y-4 p-6">
      <h1 className="text-lg font-semibold">Failure dialog preview</h1>
      <div className="flex flex-wrap gap-2">
        {names.map((name) => (
          <Button key={name} size="sm" variant={name === pick ? "dark" : "outline"} onClick={() => { setPick(name); setOpen(true); }}>{name}</Button>
        ))}
      </div>
      <div className="flex gap-2">
        <Button onClick={() => setOpen(true)}>Open dialog</Button>
        <Button variant="outline" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>Theme: {resolvedTheme ?? "light"}</Button>
      </div>
      <FailureReportDialog report={report} open={open} onOpenChange={setOpen} onFillSettings={() => undefined} onDeployAgain={() => undefined} onContinue={async () => { await new Promise((resolve) => setTimeout(resolve, 600)); setOpen(false); }} />
    </main>
  );
}
