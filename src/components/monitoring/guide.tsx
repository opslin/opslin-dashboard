"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown, ChevronRight, Cpu, HardDrive, Layers, MemoryStick, type LucideIcon } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const ITEMS: Array<{ id: string; icon: LucideIcon; title: string; summary: string; what: string; todo: string[] }> = [
    {
        id: "cpu",
        icon: Cpu,
        title: "CPU",
        summary: "How hard the server is working. Under 70% is fine.",
        what: "The processor does the thinking for your apps. A short spike is normal. Staying above 80% for a long time makes apps slow.",
        todo: ["Open the busiest app and check its logs.", "Look for a stuck process or a heavy job running all the time.", "If it stays high, move to a bigger server."],
    },
    {
        id: "memory",
        icon: MemoryStick,
        title: "Memory",
        summary: "Space your apps use to run. Above 85% apps may restart.",
        what: "When memory runs out, the server stops apps to protect itself. You will see apps restarting again and again.",
        todo: ["Find the app that uses the most memory in Top apps.", "Restart it if it grows without limit.", "Add memory or move the app to another server."],
    },
    {
        id: "disk",
        icon: HardDrive,
        title: "Disk",
        summary: "Storage for files and images. Above 90% is urgent.",
        what: "Old Docker images, logs and backups fill the disk over time. When it is full, deploys and databases fail.",
        todo: ["Open the server and use Clean and secure to clear old images.", "Delete logs and backups you no longer need.", "Use the growth estimate in What we noticed to plan ahead."],
    },
    {
        id: "load",
        icon: Layers,
        title: "Load",
        summary: "How many tasks wait for the CPU. Compare it with your number of cores.",
        what: "A load of 1.0 on a 1-core server means it is fully busy. On a 4-core server, a load of 4.0 is full. Above that, tasks queue up.",
        todo: ["Compare the load number with CPU cores on the CPU card.", "A load higher than the cores for a long time means the server is overloaded."],
    },
];

export function GuideSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
    const [expanded, setExpanded] = useState("cpu");
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[440px]">
                <SheetHeader className="border-b px-6 py-5 text-left">
                    <SheetTitle className="text-xl font-bold">How to read this page</SheetTitle>
                    <SheetDescription>The four numbers that matter</SheetDescription>
                </SheetHeader>
                <div className="flex-1 space-y-5 overflow-y-auto p-6">
                    <div aria-label="Scale" className="rounded-xl border p-4">
                        <div className="flex h-2 overflow-hidden rounded-full"><span className="w-[70%] bg-success" /><span className="w-[20%] bg-warning" /><span className="w-[10%] bg-danger" /></div>
                        <div className="mt-2 flex text-xs text-muted-foreground"><span className="w-[70%]">Good (under 70%)</span><span className="w-[20%]">Watch</span><span className="w-[10%] text-right">High</span></div>
                    </div>
                    <ul className="divide-y overflow-hidden rounded-xl border">
                        {ITEMS.map((item) => {
                            const open = expanded === item.id;
                            const Icon = item.icon;
                            return (
                                <li key={item.id}>
                                    <button type="button" aria-expanded={open} onClick={() => setExpanded(open ? "" : item.id)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left focus-visible:ring-2 focus-visible:ring-ring">
                                        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", open ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}><Icon className="size-4" aria-hidden="true" /></span>
                                        <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-foreground">{item.title}</span><span className="block text-xs text-muted-foreground">{item.summary}</span></span>
                                        {open ? <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" /> : <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />}
                                    </button>
                                    {open ? (
                                        <div className="space-y-3 bg-muted/40 px-4 pb-4 pl-[3.5rem] pt-1 text-sm">
                                            <p className="text-muted-foreground">{item.what}</p>
                                            <p className="font-semibold text-foreground">What to do when it is high</p>
                                            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">{item.todo.map((line) => <li key={line}>{line}</li>)}</ul>
                                        </div>
                                    ) : null}
                                </li>
                            );
                        })}
                    </ul>
                </div>
                <div className="flex items-center justify-between gap-3 border-t px-6 py-4 text-xs text-muted-foreground">
                    <span>Numbers refresh every 30 seconds.</span>
                    <Link href="/terminal" className="font-medium text-primary hover:underline">Open the terminal</Link>
                </div>
            </SheetContent>
        </Sheet>
    );
}
