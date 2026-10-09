"use client";

import { useState } from "react";
import { BookOpen, ChevronDown, ChevronRight, Copy, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { CHEAT_SHEET, GUIDE_STEPS } from "./commands";

async function copy(text: string) {
    try {
        await navigator.clipboard.writeText(text);
        toast.success("Copied", { duration: 1500 });
    } catch {
        toast.error("Could not copy");
    }
}

export function GuideSheet({ open, onOpenChange, onOpenLibrary }: { open: boolean; onOpenChange: (open: boolean) => void; onOpenLibrary: () => void }) {
    const [expanded, setExpanded] = useState<string>("move");

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[440px]">
                <SheetHeader className="border-b px-6 py-5 text-left">
                    <SheetTitle className="text-xl font-bold">Terminal guide</SheetTitle>
                    <SheetDescription>Five minutes to feel comfortable</SheetDescription>
                </SheetHeader>
                <div className="flex-1 space-y-6 overflow-y-auto p-6">
                    <ol className="divide-y overflow-hidden rounded-xl border">
                        {GUIDE_STEPS.map((step, index) => {
                            const isOpen = expanded === step.id;
                            return (
                                <li key={step.id}>
                                    <button
                                        type="button"
                                        aria-expanded={isOpen}
                                        onClick={() => setExpanded(isOpen ? "" : step.id)}
                                        className="flex w-full items-center gap-3 px-4 py-3.5 text-left focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                        <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold", isOpen ? "bg-primary text-primary-foreground" : "border bg-background text-muted-foreground")}>{index + 1}</span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-sm font-semibold text-foreground">{step.title}</span>
                                            <span className="block text-xs text-muted-foreground">{step.summary}</span>
                                        </span>
                                        {isOpen ? <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" /> : <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />}
                                    </button>
                                    {isOpen ? (
                                        <div className="space-y-3 bg-muted/40 px-4 pb-4 pl-[3.25rem] pt-1">
                                            <p className="text-sm text-muted-foreground">{step.body}</p>
                                            {step.commands ? (
                                                <ul className="space-y-1.5 rounded-lg border bg-background p-3">
                                                    {step.commands.map((item) => (
                                                        <li key={item.command} className="flex items-center gap-3 text-sm">
                                                            <code className="w-24 shrink-0 rounded bg-muted px-2 py-1 font-mono text-xs text-foreground">{item.command}</code>
                                                            <span className="flex-1 text-muted-foreground">{item.meaning}</span>
                                                            <button type="button" onClick={() => void copy(item.command)} aria-label={`Copy ${item.command}`} className="rounded p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"><Copy className="size-3.5" aria-hidden="true" /></button>
                                                        </li>
                                                    ))}
                                                </ul>
                                            ) : null}
                                        </div>
                                    ) : null}
                                </li>
                            );
                        })}
                    </ol>

                    <section aria-label="Quick cheat sheet" className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold text-foreground">Quick cheat sheet</h3>
                            <span className="text-xs text-muted-foreground">Copy any command</span>
                        </div>
                        <ul className="grid grid-cols-2 gap-2">
                            {CHEAT_SHEET.map((command) => (
                                <li key={command}>
                                    <button type="button" onClick={() => void copy(command)} aria-label={`Copy ${command}`} className="flex w-full items-center justify-between rounded-lg border bg-background px-3 py-2 text-left font-mono text-xs text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
                                        {command}
                                        <Copy className="size-3.5 text-muted-foreground" aria-hidden="true" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </section>
                </div>
                <div className="flex items-center justify-between gap-3 border-t px-6 py-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5"><ShieldCheck className="size-4" aria-hidden="true" />Commands that change your server need approval.</span>
                    <button type="button" onClick={() => { onOpenChange(false); onOpenLibrary(); }} className="flex shrink-0 items-center gap-1 font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring">
                        <BookOpen className="size-3.5" aria-hidden="true" />Open command library
                    </button>
                </div>
            </SheetContent>
        </Sheet>
    );
}
