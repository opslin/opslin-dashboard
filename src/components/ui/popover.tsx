import * as React from "react";
import { cn } from "@/lib/utils";

type PopoverContextValue = {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

const PopoverContext = React.createContext<PopoverContextValue | null>(null);

export function Popover({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return <PopoverContext.Provider value={{ open, setOpen }}>{children}</PopoverContext.Provider>;
}

export function PopoverTrigger({ asChild, children }: { asChild?: boolean; children: React.ReactNode }) {
  const context = React.useContext(PopoverContext);
  if (!context) return <>{children}</>;
  const child = React.Children.only(children) as React.ReactElement;
  const props = {
    onClick: () => context.setOpen((value) => !value),
  };
  return asChild ? React.cloneElement(child, props) : <button type="button" {...props}>{children}</button>;
}

export function PopoverContent({
  className,
  align = "center",
  children,
}: {
  className?: string;
  align?: "start" | "center" | "end";
  children: React.ReactNode;
}) {
  const context = React.useContext(PopoverContext);
  if (!context?.open) return null;
  const alignClass = {
    start: "left-0",
    center: "left-1/2 -translate-x-1/2",
    end: "right-0",
  }[align];
  return (
    <div className={cn("absolute top-full z-50 mt-2 w-max min-w-52 rounded-xl border border-border/70 bg-popover p-3 text-popover-foreground shadow-lg", alignClass, className)}>
      {children}
    </div>
  );
}
