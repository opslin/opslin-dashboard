import * as React from "react";
import { cn } from "@/lib/utils";

type TooltipContextValue = {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

const TooltipContext = React.createContext<TooltipContextValue | null>(null);

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function Tooltip({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return <TooltipContext.Provider value={{ open, setOpen }}>{children}</TooltipContext.Provider>;
}

export function TooltipTrigger({ asChild, children }: { asChild?: boolean; children: React.ReactNode }) {
  const context = React.useContext(TooltipContext);
  if (!context) return <>{children}</>;
  const child = React.Children.only(children) as React.ReactElement;
  const props = {
    onMouseEnter: () => context.setOpen(true),
    onMouseLeave: () => context.setOpen(false),
    onFocus: () => context.setOpen(true),
    onBlur: () => context.setOpen(false),
  };
  return asChild ? React.cloneElement(child, props) : <span {...props}>{children}</span>;
}

export function TooltipContent({ className, children }: { className?: string; children: React.ReactNode }) {
  const context = React.useContext(TooltipContext);
  if (!context?.open) return null;
  return (
    <div role="tooltip" className={cn("absolute z-50 rounded-md border border-border/70 bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md", className)}>
      {children}
    </div>
  );
}
