import * as React from "react";
import { cn } from "@/lib/utils";

export function Calendar({
  className,
  value,
  onChange,
}: {
  className?: string;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <input
      type="date"
      className={cn("border-input bg-background text-foreground h-10 rounded-md border px-3 text-sm", className)}
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
    />
  );
}
