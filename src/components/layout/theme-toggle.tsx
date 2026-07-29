"use client";

import { Check, Monitor, MoonStar, SunMedium } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const OPTIONS = [
  { value: "light", label: "Light", icon: SunMedium },
  { value: "dark", label: "Dark", icon: MoonStar },
  { value: "system", label: "System", icon: Monitor },
] as const;

/** Tri-state Light / Dark / System (doc 02 §7) — stored preference persists via next-themes. */
export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <Button type="button" variant="outline" size="sm" className="min-w-24 justify-start gap-2" disabled>
        <SunMedium className="size-4" />
        Light
      </Button>
    );
  }

  const active = OPTIONS.find((o) => o.value === theme) ?? OPTIONS.find((o) => o.value === "system")!;
  const ActiveIcon = theme === "system" ? Monitor : resolvedTheme === "dark" ? MoonStar : SunMedium;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-w-24 justify-start gap-2"
          aria-label={`Theme: ${active.label}. Click to change.`}
        >
          <ActiveIcon className="size-4" />
          <span>{active.label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        {OPTIONS.map((option) => (
          <DropdownMenuItem key={option.value} onClick={() => setTheme(option.value)} className="gap-2">
            <option.icon className="size-4" />
            <span className="flex-1">{option.label}</span>
            {theme === option.value ? <Check className="size-3.5 text-muted-foreground" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
