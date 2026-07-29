import * as React from "react";
import { cn } from "@/lib/utils";

type ToggleGroupContextValue = {
  value?: string;
  onValueChange?: (value: string) => void;
};

const ToggleGroupContext = React.createContext<ToggleGroupContextValue>({});

export function ToggleGroup({
  className,
  value,
  onValueChange,
  children,
}: {
  className?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <ToggleGroupContext.Provider value={{ value, onValueChange }}>
      <div className={cn("inline-flex items-center gap-1 rounded-lg border border-border/70 bg-secondary/60 p-1", className)}>
        {children}
      </div>
    </ToggleGroupContext.Provider>
  );
}

export function ToggleGroupItem({
  className,
  value,
  children,
  ...props
}: React.ComponentProps<"button"> & { value: string }) {
  const context = React.useContext(ToggleGroupContext);
  const active = context.value === value;

  return (
    <button
      type="button"
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
        className
      )}
      aria-pressed={active}
      onClick={() => context.onValueChange?.(value)}
      {...props}
    >
      {children}
    </button>
  );
}
