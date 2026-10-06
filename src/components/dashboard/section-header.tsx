import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Card header used on the Overview: square icon tile, title, optional subtitle, and a "View all" style link or custom action. */
export function SectionHeader({
  icon: Icon,
  title,
  description,
  href,
  hrefLabel = "View all",
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  href?: string;
  hrefLabel?: string;
  action?: React.ReactNode;
}) {
  return (
    <CardHeader className="items-center">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted/40 text-foreground">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <CardTitle className="text-lg font-semibold">{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
      </div>
      {href || action ? (
        <CardAction className="self-center">
          {action ?? (
            <Link href={href!} className="text-sm font-medium text-primary hover:underline">
              {hrefLabel}
            </Link>
          )}
        </CardAction>
      ) : null}
    </CardHeader>
  );
}
