"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Download, Lock, Pause, Play, Search, TimerReset } from "lucide-react";
import { List, type ListImperativeAPI } from "react-window";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ansiToSafeHtml,
  compileLogSearch,
  filterLogLines,
  formatLogDownload,
  hasMaskedSecret,
  lineToText,
  parseLogLines,
  type LogLevelFilter,
  type ParsedLogLine,
} from "@/lib/logs";
import type { LogLineRecord } from "@/components/logs/log-viewer";

type RowProps = {
  lines: ParsedLogLine[];
  highlightedIds: Set<string>;
  showTimestamp: boolean;
};

// Semantic status tokens (already AA-verified: check-contrast.mjs) — not the
// raw chart-N series colors, which are calibrated for data-viz lines against
// a card background, not for text-on-badge contrast (R6 a11y pass: axe found
// the previous chart-2/3/4 badges failing AA in every log line).
function levelTone(level?: string) {
  switch (level) {
    case "error":
      return "border-danger/30 bg-danger-muted text-danger-text";
    case "warn":
      return "border-warning/30 bg-warning-muted text-warning-text";
    case "debug":
      return "border-border bg-secondary text-muted-foreground";
    default:
      return "border-info/30 bg-info-muted text-info-text";
  }
}

function LogRow({
  index,
  style,
  ariaAttributes,
  lines,
  highlightedIds,
  showTimestamp,
}: {
  index: number;
  style: CSSProperties;
  ariaAttributes: Record<string, string | number>;
} & RowProps) {
  const line = lines[index];
  const highlighted = highlightedIds.has(line.id);
  const masked = hasMaskedSecret(line.raw);

  return (
    <div style={style} {...ariaAttributes} className="px-3">
      <div
        className={`grid h-full cursor-copy grid-cols-[auto_1fr] items-start gap-3 rounded-md px-3 py-2 font-mono text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
          highlighted ? "bg-primary/10" : "bg-transparent"
        }`}
        tabIndex={0}
        title="Copy log line"
        onClick={() => {
          void navigator.clipboard?.writeText(lineToText(line));
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            void navigator.clipboard?.writeText(lineToText(line));
          }
        }}
      >
        <div className="flex min-w-0 items-center gap-2">
          {showTimestamp ? (
            <span className="hidden w-[11rem] shrink-0 truncate text-muted-foreground md:inline">
              {line.timestamp || "now"}
            </span>
          ) : null}
          <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${levelTone(line.level)}`}>
            {(line.level || "info").toUpperCase()}
          </span>
          {masked ? (
            <span
              className="inline-flex items-center gap-1 rounded-md border border-success/30 bg-success-muted px-1.5 py-0.5 text-[10px] font-medium text-success-text"
              title="A secret on this line was masked by the server before it reached the dashboard"
            >
              <Lock className="size-3" aria-hidden="true" />
              <span className="sr-only">Secret masked</span>
            </span>
          ) : null}
        </div>
        <span
          className="min-w-0 break-all leading-5 text-foreground"
          dangerouslySetInnerHTML={{ __html: ansiToSafeHtml(line.raw) }}
        />
      </div>
    </div>
  );
}

export function EnhancedLogViewer({
  lines,
  title = "Logs",
  description,
  fileName = "opslin.log",
  height = 460,
}: {
  lines: string | LogLineRecord[];
  title?: string;
  description?: string;
  fileName?: string;
  height?: number;
}) {
  const [level, setLevel] = useState<LogLevelFilter>("all");
  const [query, setQuery] = useState("");
  const [regex, setRegex] = useState(false);
  const [showTimestamp, setShowTimestamp] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [paused, setPaused] = useState(false);
  const [pausedLines, setPausedLines] = useState<ParsedLogLine[] | null>(null);
  const listRef = useRef<ListImperativeAPI>(null);

  const parsedLines = useMemo(() => parseLogLines(lines), [lines]);
  const activeLines = paused ? pausedLines || parsedLines : parsedLines;
  const invalidRegex = compileLogSearch(query, regex) === "invalid";
  const filteredLines = useMemo(
    () => filterLogLines(activeLines, { level, query, regex }),
    [activeLines, level, query, regex]
  );
  const highlightedIds = useMemo(() => {
    if (!query.trim() || invalidRegex) return new Set<string>();
    return new Set(filteredLines.map((line) => line.id));
  }, [filteredLines, invalidRegex, query]);

  useEffect(() => {
    if (!autoScroll || filteredLines.length === 0) {
      return;
    }
    listRef.current?.scrollToRow({
      index: filteredLines.length - 1,
      align: "end",
      behavior: "instant",
    });
  }, [autoScroll, filteredLines.length]);

  const download = () => {
    const blob = new Blob([formatLogDownload(filteredLines)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4" data-testid="enhanced-log-viewer">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
          <p className="mt-2 text-xs text-muted-foreground" data-testid="log-line-count">
            {filteredLines.length.toLocaleString()} of {activeLines.length.toLocaleString()} lines
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (paused) {
                setPaused(false);
                setPausedLines(null);
                return;
              }
              setPausedLines(parsedLines);
              setPaused(true);
            }}
          >
            {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
            {paused ? "Resume" : "Pause"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setAutoScroll(true)}>
            <TimerReset className="size-4" />
            Jump to bottom
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={download}>
            <Download className="size-4" />
            Download
          </Button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(180px,220px)_minmax(240px,1fr)_auto_auto]">
        <select
          aria-label="Log level filter"
          value={level}
          onChange={(event) => setLevel(event.target.value as LogLevelFilter)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
        >
          <option value="all">All levels</option>
          <option value="error">Errors</option>
          <option value="warn">Warnings</option>
          <option value="info">Info</option>
          <option value="debug">Debug</option>
        </select>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-9"
            placeholder={regex ? "Regex search" : "Search logs"}
            aria-invalid={invalidRegex}
          />
        </div>
        <label className="flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm text-foreground">
          <input
            type="checkbox"
            checked={regex}
            onChange={(event) => setRegex(event.target.checked)}
            className="size-4"
          />
          Regex
        </label>
        <label className="flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm text-foreground">
          <input
            type="checkbox"
            checked={showTimestamp}
            onChange={(event) => setShowTimestamp(event.target.checked)}
            className="size-4"
          />
          Timestamps
        </label>
      </div>

      {invalidRegex ? (
        <p className="text-sm text-chart-3">Regex pattern is invalid.</p>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
        <div className="flex items-center justify-between border-b border-border/70 px-4 py-3 text-xs text-muted-foreground">
          <span>Virtualized log stream</span>
          {!autoScroll ? <span>Auto-scroll paused</span> : <span>Auto-scroll on</span>}
        </div>
        {filteredLines.length === 0 ? (
          <div className="px-5 py-10 text-sm text-muted-foreground">No log lines match the current filters.</div>
        ) : (
          <List<RowProps>
            listRef={listRef}
            data-testid="enhanced-log-list"
            rowCount={filteredLines.length}
            rowHeight={44}
            defaultHeight={height}
            overscanCount={10}
            rowComponent={LogRow}
            rowProps={{ lines: filteredLines, highlightedIds, showTimestamp }}
            style={{ height }}
            onScroll={(event) => {
              const element = event.currentTarget;
              const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
              if (distanceFromBottom > 80) {
                setAutoScroll(false);
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
