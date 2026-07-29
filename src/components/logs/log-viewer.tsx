"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, Pause, Play } from "lucide-react";
import { List } from "react-window";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type LogLineRecord = {
  id: string;
  timestamp?: string;
  level?: string;
  message?: string;
  source?: string;
};

type RowProps = {
  lines: LogLineRecord[];
  highlighted: Set<string>;
};

const RANGE_MINUTES = {
  "5m": 5,
  "15m": 15,
  "1h": 60,
  all: Number.POSITIVE_INFINITY,
} as const;

function levelClass(level?: string) {
  switch ((level || "info").toLowerCase()) {
    case "error":
      return "text-destructive";
    case "warn":
    case "warning":
      return "text-chart-4";
    case "debug":
      return "text-muted-foreground";
    default:
      return "text-chart-2";
  }
}

function Row({
  index,
  style,
  ariaAttributes,
  lines,
  highlighted,
}: {
  index: number;
  style: React.CSSProperties;
  ariaAttributes: Record<string, string | number>;
} & RowProps) {
  const line = lines[index];
  const isHighlighted = highlighted.has(line.id);

  return (
    <div style={style} {...ariaAttributes} className="px-2">
      <div
        className={`grid h-full grid-cols-[11rem_6rem_1fr_7rem] items-start gap-3 rounded-lg px-3 py-2 font-mono text-xs transition-colors ${
          isHighlighted ? "bg-primary/10" : "bg-transparent"
        }`}
      >
        <span className="truncate text-muted-foreground">{line.timestamp || "now"}</span>
        <span className={levelClass(line.level)}>{(line.level || "info").toUpperCase()}</span>
        <span className="break-all text-foreground">{line.message || ""}</span>
        <span className="truncate text-right text-muted-foreground">{line.source || "runtime"}</span>
      </div>
    </div>
  );
}

export function LogViewer({
  lines,
  title,
  description,
}: {
  lines: LogLineRecord[];
  title?: string;
  description?: string;
}) {
  const [levelFilter, setLevelFilter] = useState<"all" | "info" | "warn" | "error" | "debug">("all");
  const [timeRange, setTimeRange] = useState<keyof typeof RANGE_MINUTES>("all");
  const [search, setSearch] = useState("");
  const [paused, setPaused] = useState(false);
  const [pausedLines, setPausedLines] = useState<LogLineRecord[] | null>(null);
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());
  const previousIds = useRef<string[]>([]);
  const visibleLines = paused ? pausedLines ?? lines : lines;

  useEffect(() => {
    const oldIds = new Set(previousIds.current);
    const nextIds = visibleLines.map((line) => line.id);
    const fresh = visibleLines.filter((line) => !oldIds.has(line.id)).map((line) => line.id);

    if (fresh.length > 0) {
      setHighlightedIds(new Set(fresh));
      const timeout = window.setTimeout(() => setHighlightedIds(new Set()), 800);
      previousIds.current = nextIds;
      return () => window.clearTimeout(timeout);
    }

    previousIds.current = nextIds;
    return undefined;
  }, [visibleLines]);

  const filteredLines = useMemo(() => {
    const matcher = search.trim()
      ? (() => {
          try {
            return new RegExp(search, "i");
          } catch {
            return null;
          }
        })()
      : null;

    const latestTimestamp = visibleLines.length
      ? Date.parse(visibleLines[visibleLines.length - 1].timestamp || "") || 0
      : 0;

    return visibleLines.filter((line) => {
      const normalizedLevel = (line.level || "info").toLowerCase();
      if (levelFilter !== "all" && normalizedLevel !== levelFilter) {
        return false;
      }

      if (timeRange !== "all") {
        const cutoff = latestTimestamp - RANGE_MINUTES[timeRange] * 60_000;
        const lineTime = Date.parse(line.timestamp || "");
        if (Number.isFinite(lineTime) && lineTime < cutoff) {
          return false;
        }
      }

      if (!matcher) {
        return true;
      }

      return matcher.test(`${line.timestamp || ""} ${line.level || ""} ${line.message || ""} ${line.source || ""}`);
    });
  }, [levelFilter, search, timeRange, visibleLines]);

  const copyAll = async () => {
    await navigator.clipboard.writeText(
      filteredLines
        .map((line) => `${line.timestamp || ""} ${(line.level || "info").toUpperCase()} ${line.message || ""}`.trim())
        .join("\n")
    );
  };

  const downloadAll = () => {
    const blob = new Blob(
      [
        filteredLines
          .map((line) => `${line.timestamp || ""} ${(line.level || "info").toUpperCase()} ${line.message || ""}`.trim())
          .join("\n"),
      ],
      { type: "text/plain;charset=utf-8" }
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "opslin-runtime.log";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4" id="runtime-logs-panel">
      {title ? (
        <div>
          <h3 className="text-base font-medium text-foreground">{title}</h3>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-[160px_160px_1fr_auto_auto]">
        <select
          className="border-input bg-background text-foreground h-10 rounded-md border px-3 text-sm"
          value={levelFilter}
          onChange={(event) => setLevelFilter(event.target.value as typeof levelFilter)}
        >
          <option value="all">All levels</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
          <option value="debug">Debug</option>
        </select>
        <select
          className="border-input bg-background text-foreground h-10 rounded-md border px-3 text-sm"
          value={timeRange}
          onChange={(event) => setTimeRange(event.target.value as keyof typeof RANGE_MINUTES)}
        >
          <option value="all">All time</option>
          <option value="5m">Last 5m</option>
          <option value="15m">Last 15m</option>
          <option value="1h">Last 1h</option>
        </select>
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Regex search" />
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (paused) {
              setPaused(false);
              setPausedLines(null);
              return;
            }
            setPausedLines(lines);
            setPaused(true);
          }}
        >
          {paused ? <Play className="mr-2 h-4 w-4" /> : <Pause className="mr-2 h-4 w-4" />}
          {paused ? "Resume" : "Pause"}
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={copyAll}>
            <Copy className="mr-2 h-4 w-4" />
            Copy
          </Button>
          <Button variant="outline" size="sm" onClick={downloadAll}>
            <Download className="mr-2 h-4 w-4" />
            Download
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
        <div className="grid grid-cols-[11rem_6rem_1fr_7rem] gap-3 border-b border-border/70 px-5 py-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          <span>Time</span>
          <span>Level</span>
          <span>Message</span>
          <span className="text-right">Source</span>
        </div>
        {filteredLines.length === 0 ? (
          <div className="px-5 py-8 text-sm text-muted-foreground">No log lines match the current filters.</div>
        ) : (
          <List<RowProps>
            rowCount={filteredLines.length}
            rowHeight={42}
            defaultHeight={420}
            overscanCount={8}
            rowComponent={Row}
            rowProps={{
              lines: filteredLines,
              highlighted: highlightedIds,
            }}
            style={{ height: 420 }}
          />
        )}
      </div>
    </div>
  );
}
