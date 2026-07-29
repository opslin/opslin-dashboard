import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const then = new Date(date);
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/**
 * Avatar-fallback initials from a display name, falling back to email, then
 * "Opslin" (doc 02 §6 — promoted from 3 near-duplicate local copies in
 * settings/page.tsx, dashboard-shell.tsx, admin-topbar.tsx; this keeps
 * settings' behavior, the most correct of the three: \s+-aware split, first
 * two name parts only).
 */
export function initialsFor(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.trim() || "Opslin";
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
