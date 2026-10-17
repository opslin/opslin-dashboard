"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type CheckStep = 1 | 2 | 3;

const LABELS: Array<{ step: CheckStep; label: string }> = [
    { step: 1, label: "Domain" },
    { step: 2, label: "Verify" },
    { step: 3, label: "Results" },
];

/** Where the person is in the three-step flow. Reports state only; nothing here is clickable. */
export function StepIndicator({ current }: { current: CheckStep }) {
    return (
        <ol className="flex items-center gap-2 text-sm" aria-label="Progress">
            {LABELS.map(({ step, label }, index) => {
                const done = step < current;
                const active = step === current;
                return (
                    <li key={step} className="flex items-center gap-2" aria-current={active ? "step" : undefined}>
                        <span
                            className={cn(
                                "flex size-5 items-center justify-center rounded-full text-[11px] font-medium",
                                done && "bg-foreground text-background",
                                active && "border border-foreground text-foreground",
                                !done && !active && "border border-border text-muted-foreground",
                            )}
                        >
                            {done ? <Check className="size-3" aria-hidden="true" /> : step}
                        </span>
                        <span className={cn(active ? "font-medium text-foreground" : "text-muted-foreground")}>{label}</span>
                        {index < LABELS.length - 1 ? <span className="mx-1 h-px w-6 bg-border" aria-hidden="true" /> : null}
                    </li>
                );
            })}
        </ol>
    );
}
