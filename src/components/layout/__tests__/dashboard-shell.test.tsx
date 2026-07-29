import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DashboardShell } from "../dashboard-shell";
import type { User } from "@/lib/api";

const routerMock = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => routerMock,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    main: ({ children, ...props }: React.ComponentProps<"main">) => <main {...props}>{children}</main>,
  },
  useReducedMotion: () => true,
}));

vi.mock("@/components/layout/theme-toggle", () => ({
  ThemeToggle: () => <button type="button">Theme</button>,
}));

vi.mock("@/components/layout/command-palette", () => ({
  CommandPalette: () => null,
}));

const baseUser: User = {
  id: "user-1",
  email: "operator@example.com",
  name: "Operator",
  onboardingCompleted: true,
  emailVerified: true,
  createdAt: "2026-05-01T00:00:00.000Z",
  organizationId: "org-1",
  organizationName: "Ops Org",
  organizationSlug: "ops-org",
  orgRole: "OWNER",
  memberships: [],
};

function renderShell(user: User | null) {
  return render(
    <DashboardShell user={user} onLogout={vi.fn()}>
      <div>Dashboard content</div>
    </DashboardShell>
  );
}

describe("DashboardShell Super Admin navigation", () => {
  it("keeps the desktop sidebar sticky and preserves mobile navigation", () => {
    const { container } = renderShell(baseUser);

    const sidebar = container.querySelector("aside");
    expect(sidebar).toHaveClass("sticky", "top-0", "h-screen");
    expect(screen.getByRole("navigation", { name: "Mobile navigation" })).toBeInTheDocument();
  });

  it("shows Super Admin nav for platform admins, linking to the external admin panel", () => {
    renderShell({ ...baseUser, isPlatformAdmin: true });

    const link = screen.getByRole("link", { name: /super admin/i });
    expect(link).toHaveAttribute("href", "https://admin.opslin.com");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("hides Super Admin nav for normal users", () => {
    renderShell({ ...baseUser, isPlatformAdmin: false });

    expect(screen.queryByRole("link", { name: /super admin/i })).not.toBeInTheDocument();
  });

  it("does not treat organization OWNER as platform admin", () => {
    renderShell({ ...baseUser, orgRole: "OWNER", isPlatformAdmin: false });

    expect(screen.queryByRole("link", { name: /super admin/i })).not.toBeInTheDocument();
  });
});
