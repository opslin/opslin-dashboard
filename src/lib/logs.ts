import Convert from "ansi-to-html";
import type { LogLineRecord } from "@/components/logs/log-viewer";

export type ParsedLogLine = LogLineRecord & {
  raw: string;
  plainMessage: string;
};

export type LogLevelFilter = "all" | "debug" | "info" | "warn" | "error";

const TIMESTAMP_LEVEL_PATTERN =
  /^(\d{4}-\d{2}-\d{2}T[^\s]+)\s+(TRACE|DEBUG|INFO|WARN|WARNING|ERROR|FATAL)\s+(.*)$/i;

const converter = new Convert({
  escapeXML: true,
  newline: false,
});

export function stripAnsi(input: string) {
  return input.replace(/\u001b\[[0-9;]*m/g, "");
}

export function detectLogLevel(input: string, explicit?: string) {
  const candidate = (explicit || "").toLowerCase();
  if (candidate === "warning") return "warn";
  if (["debug", "info", "warn", "error"].includes(candidate)) {
    return candidate as Exclude<LogLevelFilter, "all">;
  }

  const plain = stripAnsi(input).toLowerCase();
  if (/\b(error|fatal|panic|exception)\b/.test(plain)) return "error";
  if (/\b(warn|warning)\b/.test(plain)) return "warn";
  if (/\bdebug\b/.test(plain)) return "debug";
  return "info";
}

export function lineToText(line: Pick<LogLineRecord, "timestamp" | "level" | "message" | "source">) {
  return [
    line.timestamp || "",
    (line.level || "info").toUpperCase(),
    line.source ? `[${line.source}]` : "",
    line.message || "",
  ].filter(Boolean).join(" ").trim();
}

export function parseLogLines(input: string | LogLineRecord[] | null | undefined): ParsedLogLine[] {
  const sourceLines = Array.isArray(input)
    ? input.map((line) => lineToText(line))
    : (input || "").split(/\r?\n/);

  return sourceLines
    .map((raw, index) => ({ raw: raw.trimEnd(), index }))
    .filter(({ raw }) => raw.trim().length > 0)
    .map(({ raw, index }) => {
      const plain = stripAnsi(raw);
      const match = TIMESTAMP_LEVEL_PATTERN.exec(plain);
      const timestamp = match?.[1];
      const levelText = match?.[2];
      const message = match?.[3] || plain;
      const level = detectLogLevel(plain, levelText);

      return {
        id: `log-${index}-${timestamp || index}`,
        timestamp,
        level,
        message,
        source: "deploy",
        raw,
        plainMessage: message,
      };
    });
}

export function compileLogSearch(query: string, regex: boolean) {
  const trimmed = query.trim();
  if (!trimmed) return null;

  if (regex) {
    try {
      return new RegExp(trimmed, "i");
    } catch {
      return "invalid";
    }
  }

  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped, "i");
}

export function filterLogLines(
  lines: ParsedLogLine[],
  options: {
    level?: LogLevelFilter;
    query?: string;
    regex?: boolean;
  }
) {
  const matcher = compileLogSearch(options.query || "", Boolean(options.regex));
  if (matcher === "invalid") {
    return [];
  }

  return lines.filter((line) => {
    if (options.level && options.level !== "all" && line.level !== options.level) {
      return false;
    }
    if (!matcher) {
      return true;
    }
    return matcher.test(`${line.timestamp || ""} ${line.level || ""} ${line.message || ""} ${line.source || ""}`);
  });
}

export function ansiToSafeHtml(input: string) {
  return converter.toHtml(input);
}

/**
 * Detects the literal markers the API's server-side masking
 * (`opslin-api/src/lib/admin-secret-mask.ts`, applied to deploy logs in
 * `lib/deployment-live.ts`) leaves behind — never a client-side redaction
 * itself (doc 04 §6/§7: "the UI never claims client-side redaction"). Used
 * only to render a display-only trust cue on lines where masking already
 * happened upstream.
 */
const MASKED_MARKER_PATTERN = /\[REDACTED(?:_JWT)?\]|Bearer \[REDACTED\]/;

export function hasMaskedSecret(rawLine: string) {
  return MASKED_MARKER_PATTERN.test(rawLine);
}

export function formatLogDownload(lines: ParsedLogLine[]) {
  return lines.map((line) => lineToText(line)).join("\n");
}
