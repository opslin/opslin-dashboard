"use client";

import { Sidebar } from "@/components/layout/sidebar";

export function LegacyDashboardShell({
  children,
  basePath,
}: {
  children: React.ReactNode;
  basePath?: string;
}) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar basePath={basePath} />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
