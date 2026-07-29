"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

function Progress({
    className,
    value = 0,
    max = 100,
    ...props
}: React.ComponentProps<"div"> & {
    value?: number;
    max?: number;
}) {
    const safeMax = Number.isFinite(max) && max > 0 ? max : 100;
    const safeValue = Number.isFinite(value) ? Math.min(safeMax, Math.max(0, value)) : 0;
    const percentage = Math.round((safeValue / safeMax) * 100);

    return (
        <div
            data-slot="progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={safeMax}
            aria-valuenow={safeValue}
            className={cn("relative h-2 w-full overflow-hidden rounded-full bg-primary/20", className)}
            {...props}
        >
            <div
                data-slot="progress-indicator"
                className="h-full w-full flex-1 bg-primary transition-transform duration-500 ease-out"
                style={{ transform: `translateX(-${100 - percentage}%)` }}
            />
        </div>
    );
}

export { Progress };
