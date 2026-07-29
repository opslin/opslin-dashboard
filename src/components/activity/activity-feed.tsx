"use client";

import { useEffect, useState } from "react";
import { Filter, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api, type ActivityEvent } from "@/lib/api";
import { activityIconForEvent, activityIconMap, type ActivityIconName } from "@/lib/activity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatRelativeTime } from "@/lib/utils";

function initialsFor(actor: ActivityEvent["actor"]) {
  const source = actor.name?.trim() || actor.email?.trim() || actor.type;
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function dayLabelFor(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (isSameDay(date, today)) return "Today";
  if (isSameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

export function ActivityFeed({
  compact = false,
  limit = 25,
  showFilters = true,
}: {
  compact?: boolean;
  limit?: number;
  showFilters?: boolean;
}) {
  const [eventFilter, setEventFilter] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const query = useQuery({
    queryKey: ["activity", limit, eventFilter, actorFilter],
    queryFn: () => api.getActivity({
      limit,
      event: eventFilter || undefined,
      actor: actorFilter || undefined,
    }),
  });

  useEffect(() => {
    if (!query.data) return;
    setEvents(query.data.events);
    setNextCursor(query.data.nextCursor);
  }, [query.data]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const page = await api.getActivity({
        limit,
        event: eventFilter || undefined,
        actor: actorFilter || undefined,
        cursor: nextCursor,
      });
      setEvents((previous) => [...previous, ...page.events]);
      setNextCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="space-y-4" data-testid={compact ? "mini-activity-feed" : "activity-feed"}>
      {showFilters ? (
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <Input
            value={eventFilter}
            onChange={(event) => setEventFilter(event.target.value)}
            placeholder="Filter by event"
            aria-label="Filter activity by event"
          />
          <Input
            value={actorFilter}
            onChange={(event) => setActorFilter(event.target.value)}
            placeholder="Filter by actor"
            aria-label="Filter activity by actor"
          />
          <Button type="button" variant="outline" onClick={() => query.refetch()}>
            <Filter className="size-4" />
            Apply
          </Button>
        </div>
      ) : null}

      <div className="space-y-3">
        {query.isLoading ? (
          <div className="rounded-lg border border-border/70 bg-secondary/30 p-4 text-sm text-muted-foreground">
            Loading activity...
          </div>
        ) : query.isError ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger-muted p-4 text-sm text-danger-text">
            <span>Couldn&apos;t load activity. Try again.</span>
            <Button type="button" variant="outline" size="sm" onClick={() => query.refetch()}>
              Retry
            </Button>
          </div>
        ) : events.length === 0 ? (
          <div className="rounded-lg border border-border/70 bg-secondary/30 p-4 text-sm text-muted-foreground">
            No activity has been recorded yet.
          </div>
        ) : (
          events.map((event, index) => {
            const iconName = (event.icon || activityIconForEvent(event.event)) as ActivityIconName;
            const Icon = activityIconMap[iconName] || activityIconMap.activity;
            const dayLabel = dayLabelFor(event.createdAt);
            const showDivider = !compact && (index === 0 || dayLabelFor(events[index - 1].createdAt) !== dayLabel);
            return (
              <div key={event.id}>
                {showDivider ? (
                  <p className="mb-3 mt-5 first:mt-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {dayLabel}
                  </p>
                ) : null}
                <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-secondary/30 p-4">
                  <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background">
                    <Icon className="size-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="min-w-0 text-sm font-medium text-foreground">{event.description}</p>
                      {!compact ? <Badge variant="outline">{event.event}</Badge> : null}
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Avatar className="size-4">
                        <AvatarFallback className="text-[8px]">{initialsFor(event.actor)}</AvatarFallback>
                      </Avatar>
                      {event.actor.name || event.actor.type} · {formatRelativeTime(event.createdAt)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {!compact && nextCursor ? (
        <Button type="button" variant="outline" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? <Loader2 className="size-4 animate-spin" /> : null}
          Load more
        </Button>
      ) : null}
    </div>
  );
}
