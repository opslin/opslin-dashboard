"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown, CircleDot, Hammer, MessageCircleQuestion, Search, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DilRunQuestion, DilRunStep } from "@/lib/api";

// API doc 80: what the owner sees of the deploy investigation. Two pieces, both plain views of data the API already
// worded: the questions a paused deploy is waiting on, and the steps the investigation took. No value typed here is
// kept in the page after it is sent.

type Answers = { settings: Record<string, string>; decisions: Record<string, string> };

const PASSWORD_NAME = /(PASSWORD|PASSWD|PASSPHRASE)/i;
// No look-alike characters (0/O, 1/l/I): the owner has to read and type this one.
const PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** A random password from the browser's secure generator, shown to the owner before the deploy goes on. */
export function generatePassword(length = 20): string {
    const bytes = new Uint32Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (n) => PASSWORD_CHARS[n % PASSWORD_CHARS.length]).join("");
}

export function DeployQuestions({ questions, submitting, error, onSubmit, onCancel }: {
    questions: DilRunQuestion[];
    submitting: boolean;
    error?: string | null;
    onSubmit: (answers: Answers) => void;
    /** Ends the paused deploy without answering. */
    onCancel?: () => void;
}) {
    const [values, setValues] = useState<Record<string, string>>({});
    // A generated or revealed value is shown as text so the owner can read and copy it before the deploy goes on.
    const [revealed, setRevealed] = useState<Record<string, boolean>>({});
    const [copied, setCopied] = useState<string | null>(null);
    const complete = questions.every((q) => (values[q.id] ?? "").trim() !== "");
    const submit = () => {
        const answers: Answers = { settings: {}, decisions: {} };
        for (const question of questions) (question.kind === "secret" ? answers.settings : answers.decisions)[question.id] = (values[question.id] ?? "").trim();
        onSubmit(answers);
    };
    return (
        <form
            className="flex flex-col gap-4"
            onSubmit={(event) => { event.preventDefault(); if (complete && !submitting) submit(); }}
        >
            <p className="text-sm text-foreground">
                The deploy is paused. It needs {questions.length === 1 ? "one thing" : `${questions.length} things`} only you can give, then it goes on from where it stopped.
            </p>
            {questions.map((question) => (
                <div key={question.id} className="flex flex-col gap-2 rounded-md border border-border bg-secondary/20 p-3">
                    <Label htmlFor={`dq-${question.id}`} className="break-all text-sm font-medium">{question.title}</Label>
                    <QuestionBody body={question.body} />
                    {question.kind === "secret" ? (
                        <>
                            <Input
                                id={`dq-${question.id}`}
                                type={revealed[question.id] ? "text" : "password"}
                                autoComplete="off"
                                spellCheck={false}
                                placeholder={PASSWORD_NAME.test(question.id) ? "Type a password or generate one" : "Paste the value"}
                                value={values[question.id] ?? ""}
                                onChange={(event) => setValues((current) => ({ ...current, [question.id]: event.target.value }))}
                            />
                            {PASSWORD_NAME.test(question.id) ? (
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                            setValues((current) => ({ ...current, [question.id]: generatePassword() }));
                                            setRevealed((current) => ({ ...current, [question.id]: true }));
                                        }}
                                    >
                                        Generate a password
                                    </Button>
                                    <Button type="button" size="sm" variant="ghost" onClick={() => setRevealed((current) => ({ ...current, [question.id]: !current[question.id] }))}>
                                        {revealed[question.id] ? "Hide" : "Show"}
                                    </Button>
                                    {(values[question.id] ?? "") !== "" ? (
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => { void navigator.clipboard?.writeText(values[question.id] ?? "").then(() => setCopied(question.id)).catch(() => undefined); }}
                                        >
                                            {copied === question.id ? "Copied" : "Copy"}
                                        </Button>
                                    ) : null}
                                    <p className="basis-full text-xs text-muted-foreground">Write it down now: you sign in with it. Opslin does not show it again.</p>
                                </div>
                            ) : null}
                        </>
                    ) : (
                        <div id={`dq-${question.id}`} role="radiogroup" aria-label={question.title} className="flex flex-wrap gap-2">
                            {(question.options ?? []).map((option) => (
                                <Button
                                    key={option}
                                    type="button"
                                    size="sm"
                                    role="radio"
                                    aria-checked={values[question.id] === option}
                                    variant={values[question.id] === option ? "dark" : "outline"}
                                    onClick={() => setValues((current) => ({ ...current, [question.id]: option }))}
                                >
                                    {option}
                                </Button>
                            ))}
                        </div>
                    )}
                </div>
            ))}
            {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
            {/* Always in view, however many questions there are: it sticks to the bottom of the scrolling area. */}
            <div className="sticky bottom-0 -mx-5 -mb-4 flex flex-col gap-1 border-t border-border bg-card px-5 py-3 sm:-mx-6 sm:px-6">
                <Button type="submit" disabled={!complete || submitting} className="w-full transition-transform active:scale-[0.97]">
                    {submitting ? "Continuing…" : "Continue the deploy"}
                </Button>
                {onCancel ? (
                    <Button type="button" variant="ghost" size="sm" disabled={submitting} onClick={onCancel} className="self-center text-muted-foreground">
                        Cancel this deploy
                    </Button>
                ) : null}
            </div>
        </form>
    );
}

/** "What it is for: …" lines as a small label/value list; a last sentence without a label is shown as a quiet note. */
function QuestionBody({ body }: { body: string }) {
    const rows: Array<{ label: string; value: string }> = [];
    const notes: string[] = [];
    for (const line of body.split("\n")) {
        const match = /^([A-Z][A-Za-z ']{2,30}):\s*(.+)$/.exec(line);
        if (match) rows.push({ label: match[1]!, value: match[2]! });
        else if (line.trim()) notes.push(line.trim());
    }
    return (
        <div className="flex flex-col gap-2">
            {rows.length > 0 ? (
                <dl className="grid gap-x-3 gap-y-1.5 text-xs leading-relaxed sm:grid-cols-[7.5rem_1fr]">
                    {rows.map((row) => (
                        <div key={row.label} className="contents">
                            <dt className="text-muted-foreground">{row.label}</dt>
                            <dd className="min-w-0 break-words text-foreground">{row.value}</dd>
                        </div>
                    ))}
                </dl>
            ) : null}
            {notes.map((note) => (
                <p key={note} className="text-xs leading-relaxed text-muted-foreground">{note}</p>
            ))}
        </div>
    );
}

function stepLine(step: DilRunStep): { icon: "look" | "change" | "deploy" | "ask" | "good" | "bad"; text: string; detail?: string } | null {
    switch (step.kind) {
        case "agent_step":
            if (step.refused) return null; // an attempt the rules turned down: noise for the owner
            return { icon: "look", text: step.note ?? step.action ?? "Looked at the project", detail: step.action };
        case "agent_plan":
            return { icon: "change", text: step.reason ?? "Changed the deployment plan", detail: (step.changes ?? []).join(" · ") };
        case "agent_exec":
            if (step.started) return null;
            return step.verified
                ? { icon: "good", text: "Deployed and checked: it works" }
                : { icon: "bad", text: `Deployed, but it did not pass${step.stage ? ` (${step.stage})` : ""}` };
        case "agent_question":
            return { icon: "ask", text: "Paused to ask you" };
        case "agent_outcome":
            if (step.outcome === "live") return { icon: "good", text: "Finished: the service is live and verified" };
            if (step.outcome === "stopped") return { icon: "bad", text: step.explanation ?? "Stopped", detail: step.nextStep ? `Next step: ${step.nextStep}` : undefined };
            return null;
        default:
            return null;
    }
}

const ICONS = {
    look: <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />,
    change: <Hammer className="size-3.5 shrink-0 text-info-text" aria-hidden="true" />,
    deploy: <CircleDot className="size-3.5 shrink-0 text-info-text" aria-hidden="true" />,
    ask: <MessageCircleQuestion className="size-3.5 shrink-0 text-warning-text" aria-hidden="true" />,
    good: <CheckCircle2 className="size-3.5 shrink-0 text-success-text" aria-hidden="true" />,
    bad: <XCircle className="size-3.5 shrink-0 text-destructive" aria-hidden="true" />,
};

/** What Opslin found, tried, changed and verified, oldest first. Closed by default: the result is what matters. */
export function InvestigationSteps({ steps, defaultOpen = false }: { steps: DilRunStep[]; defaultOpen?: boolean }) {
    const [open, setOpen] = useState(defaultOpen);
    const lines = steps.map(stepLine).filter((line): line is NonNullable<ReturnType<typeof stepLine>> => line !== null);
    if (lines.length === 0) return null;
    return (
        <div className="flex flex-col gap-2">
            <button
                type="button"
                className="flex items-center justify-between text-left text-xs font-medium uppercase text-muted-foreground"
                aria-expanded={open}
                onClick={() => setOpen((value) => !value)}
            >
                What Opslin did ({lines.length} step{lines.length === 1 ? "" : "s"})
                <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
            {open ? (
                <ol className="flex max-h-64 flex-col gap-2 overflow-y-auto rounded-md border border-border bg-secondary/20 p-3">
                    {lines.map((line, index) => (
                        <li key={index} className="flex items-start gap-2 text-xs leading-relaxed">
                            <span className="mt-0.5">{ICONS[line.icon]}</span>
                            <span className="min-w-0">
                                <span className="text-foreground">{line.text}</span>
                                {line.detail ? <span className="block break-words text-muted-foreground">{line.detail}</span> : null}
                            </span>
                        </li>
                    ))}
                </ol>
            ) : null}
        </div>
    );
}
