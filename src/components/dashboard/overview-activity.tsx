import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Bell, Box, Database, Play, Rocket, Server, Settings, User, XCircle } from "lucide-react";

import type { ActivityEvent } from "@/lib/api";
import { cn, formatRelativeTime } from "@/lib/utils";

type Outcome = "success" | "danger" | "neutral";

/** Picks an icon and a status color for an activity event from its event key and icon hint. */
function describe(event: ActivityEvent): { icon: LucideIcon; icon_class: string; outcome: Outcome } {
  const key = `${event.event} ${event.icon}`.toLowerCase();
  if (/(fail|error|crash|reject)/.test(key)) return { icon: XCircle, icon_class: "text-danger", outcome: "danger" };
  if (/(alert)/.test(key)) return { icon: Bell, icon_class: "text-danger", outcome: "danger" };
  if (/(database|backup|storage)/.test(key)) return { icon: Database, icon_class: "text-muted-foreground", outcome: "neutral" };
  if (/(user|invite|member|team)/.test(key)) return { icon: User, icon_class: "text-muted-foreground", outcome: "neutral" };
  if (/(env|setting|config)/.test(key)) return { icon: Settings, icon_class: "text-muted-foreground", outcome: "neutral" };
  if (/(server|agent)/.test(key)) return { icon: Server, icon_class: "text-muted-foreground", outcome: "neutral" };
  if (/(succe|complete|deployed|healthy)/.test(key)) return { icon: Rocket, icon_class: "text-success", outcome: "success" };
  if (/(start|resume|run)/.test(key)) return { icon: Play, icon_class: "text-success", outcome: "success" };
  if (/(deploy|rocket)/.test(key)) return { icon: Rocket, icon_class: "text-success", outcome: "success" };
  return { icon: Box, icon_class: "text-muted-foreground", outcome: "neutral" };
}

function targetHref(event: ActivityEvent): string | null {
  const { type, id } = event.target;
  if (!type || !id) return null;
  if (type === "app") return `/apps/${id}`;
  if (type === "server") return `/servers/${id}`;
  if (type === "database") return `/databases/${id}`;
  return null;
}

/** Splits the description around the first metadata value it contains (an app or server name) so that name can be a link. */
function splitDescription(event: ActivityEvent): { before: string; name: string; after: string } | null {
  const candidates = Object.values(event.metadata ?? {}).filter((value): value is string => typeof value === "string" && value.length > 1);
  for (const name of candidates) {
    const index = event.description.indexOf(name);
    if (index >= 0) {
      return { before: event.description.slice(0, index), name, after: event.description.slice(index + name.length) };
    }
  }
  return null;
}

const DOT: Record<Outcome, string> = { success: "bg-success", danger: "bg-danger", neutral: "bg-muted-foreground/40" };

export function OverviewActivity({ events }: { events: ActivityEvent[] }) {
  return (
    <ul className="space-y-1.5">
      {events.map((event) => {
        const { icon: Icon, icon_class, outcome } = describe(event);
        const href = targetHref(event);
        const parts = splitDescription(event);
        return (
          <li key={event.id} className="flex items-center gap-3 py-0.5 text-[13px]">
            <span className={cn("size-1.5 shrink-0 rounded-full", DOT[outcome])} aria-hidden="true" />
            <Icon className={cn("size-[18px] shrink-0", icon_class)} aria-hidden="true" />
            <p className="min-w-0 flex-1 truncate text-foreground">
              {parts ? (
                <>
                  {parts.before}
                  {href ? (
                    <Link href={href} className="text-primary underline-offset-2 hover:underline dark:underline">
                      {parts.name}
                    </Link>
                  ) : (
                    <span className="text-primary">{parts.name}</span>
                  )}
                  {parts.after}
                </>
              ) : (
                event.description
              )}
            </p>
            <time dateTime={event.createdAt} className="shrink-0 text-muted-foreground">
              {formatRelativeTime(event.createdAt)}
            </time>
          </li>
        );
      })}
    </ul>
  );
}
