/**
 * AppSecurityPage — Integration Test
 *
 * Validates: Requirements 1.1, 1.2, 1.5, 1.6, 4.1, 4.5, 14.1, 14.2, 14.4, 14.6
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

import type { App, Server, AppMetricCurrent } from "@/lib/api";
import { SHIELD_ORDER, SHIELD_CATALOG } from "@/lib/security/shield-catalog";
import { PLAN_BUNDLES } from "@/lib/security/plan-bundle-map";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockReplace = vi.fn();
const mockPush = vi.fn();
let mockSearchParamsValue = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => mockSearchParamsValue,
  useParams: () => ({ id: "app-123" }),
}));

const mockGetServers = vi.fn();
const mockGetApps = vi.fn();
const mockDeployApp = vi.fn();
const mockGetAppMetricsCurrent = vi.fn();
const mockGetCurrentPlan = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    getServers: (...args: unknown[]) => mockGetServers(...args),
    getApps: (...args: unknown[]) => mockGetApps(...args),
    deployApp: (...args: unknown[]) => mockDeployApp(...args),
    getAppMetricsCurrent: (...args: unknown[]) => mockGetAppMetricsCurrent(...args),
    getCurrentPlan: (...args: unknown[]) => mockGetCurrentPlan(...args),
  },
}));

vi.mock("@/hooks/usePlan", () => ({
  usePlan: () => ({
    plan: { slug: "pro", name: "Pro", features: {}, maxServers: 10, maxApps: 10, maxDatabases: 10 },
    subscription: null,
    usage: { servers: 1, apps: 1, databases: 0 },
    trial: null,
    loading: false,
    refresh: vi.fn(),
    can: () => true,
    isAtLimit: () => false,
  }),
}));

vi.mock("@/components/apps/app-helpers", () => ({
  appAccessUrl: () => ({ url: "http://localhost:3000", label: "Port 3000", scope: "Local", help: "" }),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseServer: Server = {
  id: "server-1",
  name: "Test Server",
  ip: "192.168.1.1",
  status: "connected",
  createdAt: "2024-01-01T00:00:00Z",
};

function makeApp(overrides: Partial<App> = {}): App {
  return {
    id: "app-123",
    name: "My App",
    status: "running",
    domain: "myapp.example.com",
    port: 3000,
    envVars: { NODE_ENV: "production" },
    createdAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

const baseMetric: AppMetricCurrent = {
  id: "metric-1",
  name: "My App",
  status: "running",
  healthStatus: "healthy",
  healthPath: "/health",
  cpuPercent: 12.5,
  memoryUsed: 128 * 1024 * 1024,
  memoryLimit: 512 * 1024 * 1024,
  restartCount: 0,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
}

function renderWithProviders(ui: React.ReactElement, queryClient?: QueryClient) {
  const qc = queryClient ?? createQueryClient();
  return {
    ...render(
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
    ),
    queryClient: qc,
  };
}

function setupDefaultMocks(appOverrides: Partial<App> = {}) {
  mockGetServers.mockResolvedValue([baseServer]);
  mockGetApps.mockResolvedValue([makeApp(appOverrides)]);
  mockGetAppMetricsCurrent.mockResolvedValue(baseMetric);
  mockGetCurrentPlan.mockResolvedValue({
    plan: { slug: "pro", name: "Pro", features: {}, maxServers: 10, maxApps: 10, maxDatabases: 10 },
    subscription: null,
    usage: { servers: 1, apps: 1, databases: 0 },
    trial: null,
  });
}

// ---------------------------------------------------------------------------
// Import the component under test AFTER mocks are set up
// ---------------------------------------------------------------------------

import { AppSecurityPage } from "../AppSecurityPage";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AppSecurityPage — Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParamsValue = new URLSearchParams();
  });

  // -------------------------------------------------------------------------
  // Requirement 1.1: Region order
  // -------------------------------------------------------------------------
  describe("Region order", () => {
    it("renders the eight regions in the requirement-defined top-to-bottom order", async () => {
      setupDefaultMocks();

      renderWithProviders(<AppSecurityPage appId="app-123" />);

      // Wait for data to load
      await waitFor(() => {
        expect(screen.getByText("My App")).toBeInTheDocument();
      });

      // The eight regions are identified by their aria-labelledby headings
      // rendered as direct children of <main> (or inside <header> for the first region)
      const expectedRegionIds = [
        "header-region-title",
        "security-summary-title",
        "active-bundle-title",
        "locked-bundle-title",
        "domain-summary-title",
        "environment-summary-title",
        "monitoring-summary-title",
        "next-step-guidance-title",
      ];

      const expectedRegionTitles = [
        "App Header",
        "Security Summary",
        "Active Protections",
        "Locked Protections",
        "Domain Summary",
        "Environment Summary",
        "Monitoring Summary",
        "Next Step Guidance",
      ];

      // Get the top-level sections (direct children of main or header within main)
      const mainEl = document.querySelector("main");
      expect(mainEl).not.toBeNull();

      // Verify each expected region heading exists and appears in order
      const renderedTitles: string[] = [];
      for (const id of expectedRegionIds) {
        const heading = document.getElementById(id);
        expect(heading).not.toBeNull();
        renderedTitles.push(heading!.textContent ?? "");
      }

      expect(renderedTitles).toEqual(expectedRegionTitles);

      // Verify the order in the DOM by checking that each heading appears
      // after the previous one in document order
      const allText = mainEl!.innerHTML;
      let lastIndex = -1;
      for (const id of expectedRegionIds) {
        const idx = allText.indexOf(`id="${id}"`);
        expect(idx).toBeGreaterThan(lastIndex);
        lastIndex = idx;
      }
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 1.2: Log absence
  // -------------------------------------------------------------------------
  describe("Log absence", () => {
    it("does not render any <pre> log streams", async () => {
      setupDefaultMocks();

      renderWithProviders(<AppSecurityPage appId="app-123" />);

      await waitFor(() => {
        expect(screen.getByText("My App")).toBeInTheDocument();
      });

      const preElements = document.querySelectorAll("pre");
      expect(preElements.length).toBe(0);
    });

    it("does not render any nav entry labeled 'Logs'", async () => {
      setupDefaultMocks();

      renderWithProviders(<AppSecurityPage appId="app-123" />);

      await waitFor(() => {
        expect(screen.getByText("My App")).toBeInTheDocument();
      });

      expect(screen.queryByText("Logs")).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /logs/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /logs/i })).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 1.5: ?section=logs redirect
  // -------------------------------------------------------------------------
  describe("?section=logs redirect", () => {
    it("calls router.replace exactly once, stripping section but preserving other params", async () => {
      // Set up search params with section=logs&keep=me
      mockSearchParamsValue = new URLSearchParams("section=logs&keep=me");

      setupDefaultMocks();

      renderWithProviders(<AppSecurityPage appId="app-123" />);

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledTimes(1);
      });

      const replaceCall = mockReplace.mock.calls[0][0] as string;

      // The target query string should contain keep=me
      expect(replaceCall).toContain("keep=me");
      // The target query string should NOT contain section
      expect(replaceCall).not.toContain("section");
    });
  });

  // -------------------------------------------------------------------------
  // Requirements 4.1, 4.5: RUNNING vs ERROR shield states
  // -------------------------------------------------------------------------
  describe("RUNNING vs ERROR shield states", () => {
    it("renders the Pro bundle's six shields with Active when app is running with domain configured", async () => {
      setupDefaultMocks({ status: "running", domain: "myapp.example.com" });

      renderWithProviders(<AppSecurityPage appId="app-123" />);

      await waitFor(() => {
        expect(screen.getByText("My App")).toBeInTheDocument();
      });

      // Pro plan has 6 shields in its bundle
      const proBundle = PLAN_BUNDLES.Pro;
      const bundleShields = SHIELD_ORDER.filter((s) => proBundle.has(s));

      // All 6 bundle shields should render with "Active" badge
      const activeBadges = screen.getAllByText("Active");
      expect(activeBadges.length).toBe(bundleShields.length);

      // Verify each bundle shield's display label is present
      for (const shield of bundleShields) {
        expect(
          screen.getByText(SHIELD_CATALOG[shield].displayLabel)
        ).toBeInTheDocument();
      }
    });

    it("renders every in-bundle shield with Pending and no shield with Active when app status is error", async () => {
      setupDefaultMocks({ status: "error", domain: "myapp.example.com" });

      renderWithProviders(<AppSecurityPage appId="app-123" />);

      await waitFor(() => {
        expect(screen.getByText("My App")).toBeInTheDocument();
      });

      // Pro plan has 6 shields in its bundle — all should be Pending when status is error
      const proBundle = PLAN_BUNDLES.Pro;
      const bundleShields = SHIELD_ORDER.filter((s) => proBundle.has(s));

      // All bundle shields should render with "Pending" badge
      const pendingBadges = screen.getAllByText("Pending");
      expect(pendingBadges.length).toBe(bundleShields.length);

      // No shield should render with "Active"
      expect(screen.queryByText("Active")).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 14.6: Page-level error retry
  // -------------------------------------------------------------------------
  describe("Page-level error retry", () => {
    it("renders a single retry control when the app query fails and no region content below", async () => {
      // To trigger the error state, we need the queryFn to throw an unhandled error.
      // The component's queryFn iterates over `servers` with for...of. If we make
      // getServers return a non-iterable object with a length property, the for...of
      // will throw a TypeError that escapes the internal try/catch.
      const nonIterableServers = { length: 1, 0: baseServer } as unknown as Server[];
      mockGetServers.mockResolvedValue(nonIterableServers);
      mockGetApps.mockResolvedValue([]);
      mockGetAppMetricsCurrent.mockResolvedValue(baseMetric);
      mockGetCurrentPlan.mockResolvedValue({
        plan: { slug: "pro", name: "Pro", features: {}, maxServers: 10, maxApps: 10, maxDatabases: 10 },
        subscription: null,
        usage: { servers: 1, apps: 1, databases: 0 },
        trial: null,
      });

      renderWithProviders(<AppSecurityPage appId="app-123" />);

      // Wait for the error state to render
      await waitFor(() => {
        expect(
          screen.getByText(/unable to load security details/i)
        ).toBeInTheDocument();
      });

      // Assert a single retry button renders
      const retryButton = screen.getByRole("button", { name: /retry/i });
      expect(retryButton).toBeInTheDocument();

      // Assert no region content renders below the error card
      const sections = document.querySelectorAll("section[aria-labelledby]");
      expect(sections.length).toBe(0);
    });

    it("clicking retry triggers query invalidation", async () => {
      const nonIterableServers = { length: 1, 0: baseServer } as unknown as Server[];
      mockGetServers.mockResolvedValue(nonIterableServers);
      mockGetApps.mockResolvedValue([]);
      mockGetAppMetricsCurrent.mockResolvedValue(baseMetric);
      mockGetCurrentPlan.mockResolvedValue({
        plan: { slug: "pro", name: "Pro", features: {}, maxServers: 10, maxApps: 10, maxDatabases: 10 },
        subscription: null,
        usage: { servers: 1, apps: 1, databases: 0 },
        trial: null,
      });

      const queryClient = createQueryClient();
      renderWithProviders(<AppSecurityPage appId="app-123" />, queryClient);

      // Wait for the error state
      await waitFor(() => {
        expect(
          screen.getByText(/unable to load security details/i)
        ).toBeInTheDocument();
      });

      // Spy on invalidateQueries
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      // Click the retry button
      const retryButton = screen.getByRole("button", { name: /retry/i });
      fireEvent.click(retryButton);

      // Assert invalidateQueries was called with the correct query key
      expect(invalidateSpy).toHaveBeenCalledTimes(1);
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ["app", "app-123"] })
      );
    });
  });
});
