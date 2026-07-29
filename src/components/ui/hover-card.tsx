import * as React from "react";
import { cn } from "@/lib/utils";

type HoverCardContextValue = {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

const HoverCardContext = React.createContext<HoverCardContextValue | null>(null);

export function HoverCard({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return <HoverCardContext.Provider value={{ open, setOpen }}>{children}</HoverCardContext.Provider>;
}

export function HoverCardTrigger({ asChild, children }: { asChild?: boolean; children: React.ReactNode }) {
  const context = React.useContext(HoverCardContext);
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

export function HoverCardContent({ className, children }: { className?: string; children: React.ReactNode }) {
  const context = React.useContext(HoverCardContext);
  if (!context?.open) return null;
  return (
    <div className={cn("absolute z-50 mt-2 w-72 rounded-xl border border-border/70 bg-popover p-4 text-popover-foreground shadow-lg", className)}>
      {children}
    </div>
  );
}
