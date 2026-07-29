"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{
        // Blur via a real Tailwind utility class, not hand-written CSS —
        // Lightning CSS silently drops the unprefixed `backdrop-filter`
        // declaration for hand-written rules in this project's build
        // (verified against compiled CSS output for both this and
        // .glass-panel; only Tailwind's own --tw-backdrop-blur composition
        // chain reliably emits both prefixed and unprefixed properties).
        className: "backdrop-blur-md",
      }}
      style={
        {
          // Glass surface (doc 02 §3.3 — toasts are on the allowed list).
          "--normal-bg": "var(--opslin-glass-bg)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--opslin-glass-border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
