"use client";

import Link from "next/link";
import { useState } from "react";
import { BookOpen, Check, ChevronDown, ChevronRight, Cpu, HardDrive, Layers, MemoryStick, Terminal, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const ITEMS: Array<{ id: string; icon: LucideIcon; title: string; summary: string; what: string; todo: string[] }> = [
    {
        id: "cpu",
        icon: Cpu,
        title: "CPU",
        summary: "How hard the server is working. Under 70% is fine.",
        what: "The processor does the thinking for your apps. A short spike is normal. Staying above 80% for a long time makes apps slow.",
        todo: ["Check which app is using CPU", "Restart a stuck app, if needed", "Move a busy app to another server"],
    },
    {
        id: "memory",
        icon: MemoryStick,
        title: "Memory",
        summary: "Space apps use to run. Over 85% may cause restarts.",
        what: "When memory runs out, the server stops apps to protect itself. You will see apps restarting again and again.",
        todo: ["Find the app using the most memory in Top apps", "Restart it if it keeps growing", "Add memory or move the app to another server"],
    },
    {
        id: "disk",
        icon: HardDrive,
        title: "Disk",
        summary: "Storage for files. Above 90% is urgent.",
        what: "Old Docker images, logs and backups fill the disk over time. When it is full, deploys and databases fail.",
        todo: ["Open the server and use Clean and secure to clear old images", "Delete logs and backups you no longer need", "Use the growth estimate in What we noticed to plan ahead"],
    },
    {
        id: "load",
        icon: Layers,
        title: "Load",
        summary: "Tasks waiting for CPU. Compare with your cores.",
        what: "A load of 1.0 on a 1-core server means it is fully busy. On a 4-core server, a load of 4.0 is full. Above that, tasks queue up.",
        todo: ["Compare the load number with the CPU cores on the CPU card", "A load above your cores for a long time means the server is overloaded"],
    },
];

const FIXES = ["Close apps you no longer use", "Clean up unused Docker images", "Set alerts before resources run out"];

export function GuideSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
    const [expanded, setExpanded] = useState("cpu");
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[460px]">
                <SheetHeader className="border-b px-6 py-4 text-left">
                    <SheetTitle className="text-base font-bold">Monitoring guide</SheetTitle>
                    <SheetDescription className="sr-only">How to read the numbers on this page</SheetDescription>
                </SheetHeader>
                <div className="flex-1 space-y-5 overflow-y-auto p-6">
                    <div>
                        <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><BookOpen className="size-5" aria-hidden="true" /></span>
                        <h2 className="mt-3 text-2xl font-bold tracking-tight text-foreground">How to read this page</h2>
                        <p className="text-sm text-muted-foreground">The four numbers that matter</p>
                    </div>
                    <ul className="space-y-2.5">
                        {ITEMS.map((item) => {
                            const isOpen = expanded === item.id;
                            const Icon = item.icon;
                            return (
                                <li key={item.id} className="overflow-hidden rounded-xl border">
                                    <button type="button" aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? "" : item.id)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left focus-visible:ring-2 focus-visible:ring-ring">
                                        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", isOpen ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}><Icon className="size-4" aria-hidden="true" /></span>
                                        <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-foreground">{item.title}</span><span className="block text-xs text-muted-foreground">{item.summary}</span></span>
                                        {isOpen ? <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" /> : <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />}
                                    </button>
                                    {isOpen ? (
                                        <div className="space-y-4 px-4 pb-4 text-sm">
                                            <p className="text-muted-foreground">{item.what}</p>
                                            <div>
                                                <div className="flex h-2 overflow-hidden rounded-full"><span className="w-[70%] bg-success" /><span className="w-[20%] bg-warning" /><span className="w-[10%] bg-danger" /></div>
                                                <div className="mt-1.5 flex text-xs text-muted-foreground"><span className="w-[70%]">Good &lt;70%</span><span className="w-[20%]">Watch 70–90%</span><span className="w-[10%] text-right">High &gt;90%</span></div>
                                            </div>
                                            <div>
                                                <p className="font-semibold text-foreground">What to do when it&apos;s high</p>
                                                <ul className="mt-1.5 list-disc space-y-1 pl-5 text-muted-foreground">{item.todo.map((line) => <li key={line}>{line}</li>)}</ul>
                                            </div>
                                            <Button asChild size="sm" variant="outline"><Link href="/terminal"><Terminal aria-hidden="true" />Open command library</Link></Button>
                                        </div>
                                    ) : null}
                                </li>
                            );
                        })}
                    </ul>
                    <section aria-label="Common fixes">
                        <h3 className="text-sm font-bold text-foreground">Common fixes</h3>
                        <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
                            {FIXES.map((fix) => (
                                <li key={fix} className="flex items-center gap-2"><Check className="size-4 text-success" aria-hidden="true" />{fix}</li>
                            ))}
                        </ul>
                    </section>
                </div>
                <p className="border-t px-6 py-4 text-xs text-muted-foreground">Numbers refresh every 30 seconds.</p>
            </SheetContent>
        </Sheet>
    );
}
