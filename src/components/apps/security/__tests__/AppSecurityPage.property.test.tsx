/**
 * Property-based tests for AppSecurityPage (DOM-level).
 * Uses fast-check with vitest + @testing-library/react.
 *
 * Properties tested:
 * - P10: page never uses red, orange, or yellow except the Header ERROR badge
 * - P12: page omits env-var values/names and other developer-heavy fields
 *
 * Requirements: 6.3, 6.6, 9.2, 11.3, 12.3, 13.1, 13.2, 13.4, 13.6
 */

import { render } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock next/navigation
const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};
const mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => mockSearchParams,
  useParams: () => ({ id: "test-app-id" }),
  usePathname: () => "/apps/test-app-id",
}));

// Mock lib/api
const mockServers = [
  {
    id: "server-1",
    name: "Test Server",
    ip: "192.168.1.1",
    publicIp: "1.2.3.4",
    hostname: "test-server",
    status: "connected",
  },
];

let mockApp: Record<string, unknown> = {};
let mockMetric: Record<string, unknown> | null = null;

vi.mock("@/lib/api", () => ({
  api: {
    getServers: vi.fn(() => Promise.resolve(mockServers)),
    getApps: vi.fn(() => Promise.resolve([mockApp])),
    deployApp: vi.fn(() => Promise.resolve({ id: "job-1", status: "ok" })),
    getAppMetricsCurrent: vi.fn(() => Promise.resolve(mockMetric)),
    getCurrentPlan: vi.fn(() =>
      Promise.resolve({
        plan: { slug: "free", name: "Free", features: {}, maxServers: 1, maxApps: 3, maxDatabases: 1 },
        subscription: null,
        usage: { servers: 1, apps: 1, databases: 0 },
        trial: null,
      })
    ),
  },
}));

// Mock hooks/usePlan
let mockPlanSlug = "free";

vi.mock("@/hooks/usePlan", () => ({
  usePlan: () => ({
    plan: { slug: mockPlanSlug, name: mockPlanSlug, features: {}, maxServers: 1, maxApps: 3, maxDatabases: 1 },
    subscription: null,
    usage: { servers: 1, apps: 1, databases: 0 },
    trial: null,
    loading: false,
    refresh: vi.fn(),
    can: () => false,
    isAtLimit: () => false,
  }),
}));

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) =>
    React.createElement("a", { href, ...props }, children),
}));

// Import the component under test AFTER mocks are set up
import { AppSecurityPage } from "../AppSecurityPage";

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function renderWithProviders(appId: string) {
  const queryClient = createQueryClient();

  // Pre-populate the query cache so the component renders synchronously
  queryClient.setQueryData(["servers"], mockServers);
  queryClient.setQueryData(["app", appId], { app: mockApp, server: mockServers[0] });
  queryClient.setQueryData(["app-metrics", appId], mockMetric);

  return render(
    <QueryClientProvider client={queryClient}>
      <AppSecurityPage appId={appId} />
    </QueryClientProvider>
  );
}

/**
 * Regex matching Tailwind color tokens for red, orange, yellow, or amber
 * with a numeric suffix (e.g., red-500, amber-100, yellow-700).
 */
const FORBIDDEN_COLOR_REGEX = /(?:^|\s|-)(?:red|orange|yellow|amber)-\d+/;

/**
 * Checks if an inline style contains forbidden color groups.
 */
const FORBIDDEN_STYLE_REGEX = /(?:red|orange|yellow|amber)/i;

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** App statuses excluding "error" for P10 non-error case */
const arbNonErrorStatus = fc.constantFrom(
  "running",
  "deploying",
  "pending",
  "stopped"
);

/** All app statuses */
const arbAppStatus = fc.constantFrom(
  "running",
  "deploying",
  "pending",
  "stopped",
  "error"
);

/** Plan slugs */
const arbPlanSlug = fc.constantFrom("free", "starter", "pro", "business", "enterprise");

/** Generate a simple domain or null */
const arbDomain = fc.oneof(
  fc.constant(null as string | null),
  fc.constant(undefined as string | null | undefined),
  fc.constant(""),
  fc.webUrl().map((url) => new URL(url).hostname)
);

/** Generate a simple metric or null */
const arbMetric = fc.oneof(
  fc.constant(null),
  fc.record({
    id: fc.constant("metric-1"),
    name: fc.constant("Test App"),
    status: fc.constantFrom("running", "stopped", "error"),
    healthStatus: fc.constantFrom("healthy", "unhealthy", "unknown") as fc.Arbitrary<"healthy" | "unhealthy" | "unknown">,
    healthPath: fc.constant("/health"),
    cpuPercent: fc.float({ min: 0, max: 100, noNaN: true }),
    memoryUsed: fc.integer({ min: 0, max: 1024 * 1024 * 1024 }),
    memoryLimit: fc.integer({ min: 1024 * 1024, max: 2 * 1024 * 1024 * 1024 }),
    restartCount: fc.integer({ min: 0, max: 100 }),
  })
);

/**
 * Generate env var keys that are identifiable (uppercase with underscores,
 * at least 5 chars to avoid false positives with common words).
 */
const arbEnvVarKey = fc
  .array(fc.constantFrom("A", "B", "C", "D", "X", "Y", "Z", "_"), {
    minLength: 5,
    maxLength: 12,
  })
  .map((chars) => chars.join(""))
  .filter((s) => /^[A-Z_]{5,}$/.test(s) && !["ERROR", "ACTIVE"].includes(s));

/**
 * Generate env var values that are identifiable (random alphanumeric strings,
 * at least 8 chars to avoid false positives).
 */
const arbEnvVarValue = fc
  .array(fc.constantFrom("a", "b", "c", "d", "e", "f", "1", "2", "3", "4", "5"), {
    minLength: 8,
    maxLength: 20,
  })
  .map((chars) => chars.join(""))
  .filter((s) => s.length >= 8);

/** Generate a Record<string, string> of env vars */
const arbEnvVars = fc.dictionary(arbEnvVarKey, arbEnvVarValue, {
  minKeys: 1,
  maxKeys: 5,
});

/**
 * Generate a git URL that contains a hex SHA-like pattern.
 * We use a fixed format to ensure the hex pattern is detectable.
 */
const arbGitUrl = fc.constant("https://github.com/user/repo.git");

/** Generate a branch name */
const arbBranch = fc.constantFrom("main", "develop", "feature/test");

/** Generate deploy logs with developer-heavy content */
const arbDeployLogs = fc.constantFrom(
  "Step 1/5: Building...\nStep 2/5: PENDING\nStep 3/5: RUNNING\nStep 4/5: COMPLETED\nStep 5/5: Done",
  "Build FAILED at step 3",
  null
);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("AppSecurityPage — Property-Based Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRouter.push.mockClear();
    mockRouter.replace.mockClear();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Feature: app-details-security-redesign, Property 10: page never uses red,
  // orange, or yellow except the Header ERROR badge
  // ─────────────────────────────────────────────────────────────────────────
  describe("Property P10: page never uses red, orange, or yellow except the Header ERROR badge", () => {
    it("non-error status: no element uses forbidden color tokens", () => {
      fc.assert(
        fc.property(
          arbNonErrorStatus,
          arbPlanSlug,
          arbMetric,
          arbDomain,
          (status, planSlug, metric, domain) => {
            // Feature: app-details-security-redesign, Property 10: page never uses red, orange, or yellow except the Header ERROR badge

            mockPlanSlug = planSlug;
            mockMetric = metric;
            mockApp = {
              id: "test-app-id",
              name: "Test App",
              status,
              domain: domain || undefined,
              port: 3000,
              envVars: { NODE_ENV: "production" },
              createdAt: "2024-01-01T00:00:00Z",
            };

            const { container, unmount } = renderWithProviders("test-app-id");

            // Walk all elements and check classNames
            const allElements = container.querySelectorAll("*");
            for (const el of allElements) {
              const className = el.getAttribute("class") ?? "";
              if (FORBIDDEN_COLOR_REGEX.test(className)) {
                unmount();
                throw new Error(
                  `Found forbidden color token in className: "${className}" on element <${el.tagName.toLowerCase()}>`
                );
              }

              // Check inline styles
              const style = el.getAttribute("style") ?? "";
              if (style && FORBIDDEN_STYLE_REGEX.test(style)) {
                unmount();
                throw new Error(
                  `Found forbidden color in inline style: "${style}" on element <${el.tagName.toLowerCase()}>`
                );
              }
            }

            unmount();
          }
        ),
        { numRuns: 50 }
      );
    });

    it("error status: only the AppStatusBadge uses forbidden color tokens", () => {
      fc.assert(
        fc.property(
          arbPlanSlug,
          arbMetric,
          arbDomain,
          (planSlug, metric, domain) => {
            // Feature: app-details-security-redesign, Property 10: page never uses red, orange, or yellow except the Header ERROR badge

            mockPlanSlug = planSlug;
            mockMetric = metric;
            mockApp = {
              id: "test-app-id",
              name: "Test App",
              status: "error",
              domain: domain || undefined,
              port: 3000,
              envVars: { NODE_ENV: "production" },
              createdAt: "2024-01-01T00:00:00Z",
            };

            const { container, unmount } = renderWithProviders("test-app-id");

            // Collect all elements with forbidden color tokens
            const allElements = container.querySelectorAll("*");
            const matchingElements: Element[] = [];

            for (const el of allElements) {
              const className = el.getAttribute("class") ?? "";
              const style = el.getAttribute("style") ?? "";

              if (
                FORBIDDEN_COLOR_REGEX.test(className) ||
                (style && FORBIDDEN_STYLE_REGEX.test(style))
              ) {
                matchingElements.push(el);
              }
            }

            // The only matching element(s) should be inside the header region
            // and specifically be the AppStatusBadge (which renders as a Badge/span)
            for (const el of matchingElements) {
              // The AppStatusBadge is inside the <header> element
              const isInsideHeader = el.closest("header") !== null;
              if (!isInsideHeader) {
                unmount();
                throw new Error(
                  `Found forbidden color token outside header: className="${el.getAttribute("class")}" on <${el.tagName.toLowerCase()}>`
                );
              }

              // Verify it's the status badge — it should contain the text "Error"
              // or be a parent of an element containing "Error"
              const textContent = el.textContent ?? "";
              const isStatusBadge =
                textContent.includes("Error") ||
                textContent.includes("error") ||
                el.closest('[class*="bg-red"]') !== null;

              if (!isStatusBadge && FORBIDDEN_COLOR_REGEX.test(el.getAttribute("class") ?? "")) {
                // Check if this element is a child of the badge
                const parentBadge = el.closest('[class*="bg-red"]');
                if (!parentBadge) {
                  unmount();
                  throw new Error(
                    `Found forbidden color token in header but not on AppStatusBadge: className="${el.getAttribute("class")}" text="${textContent}"`
                  );
                }
              }
            }

            unmount();
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Feature: app-details-security-redesign, Property 12: page omits env-var
  // values/names and other developer-heavy fields
  // ─────────────────────────────────────────────────────────────────────────
  describe("Property P12: page omits env-var values/names and other developer-heavy fields", () => {
    it("rendered DOM does not contain env-var keys, values, commit SHAs, or job status literals outside the status badge", () => {
      fc.assert(
        fc.property(
          arbEnvVars,
          arbGitUrl,
          arbBranch,
          arbDeployLogs,
          fc.integer({ min: 1000, max: 65535 }),
          (envVars, gitUrl, branch, deployLogs, port) => {
            // Feature: app-details-security-redesign, Property 12: page omits env-var values/names and other developer-heavy fields

            mockPlanSlug = "pro";
            mockMetric = {
              id: "metric-1",
              name: "Test App",
              status: "running",
              healthStatus: "healthy",
              healthPath: "/health",
              cpuPercent: 25.5,
              memoryUsed: 128 * 1024 * 1024,
              memoryLimit: 512 * 1024 * 1024,
              restartCount: 2,
            };
            mockApp = {
              id: "test-app-id",
              name: "Test App",
              status: "running",
              domain: "myapp.example.com",
              port,
              gitUrl,
              branch,
              deployLogs,
              envVars,
              registryCredentials: {
                server: "registry.example.com",
                username: "reguser123",
              },
              createdAt: "2024-01-01T00:00:00Z",
            };

            const { container, unmount } = renderWithProviders("test-app-id");

            const textContent = container.textContent ?? "";

            // (a) Does not contain any env-var key
            for (const key of Object.keys(envVars)) {
              if (textContent.includes(key)) {
                unmount();
                throw new Error(
                  `DOM text content contains env-var key: "${key}"`
                );
              }
            }

            // (b) Does not contain any env-var value
            for (const value of Object.values(envVars)) {
              if (textContent.includes(value)) {
                unmount();
                throw new Error(
                  `DOM text content contains env-var value: "${value}"`
                );
              }
            }

            // (c) Does not contain any hex string matching /[0-9a-f]{7,40}/
            // that could be derived from the app (commit SHAs, etc.)
            // We check for hex patterns that are at least 7 chars long
            const hexMatches = textContent.match(/[0-9a-f]{7,40}/gi);
            if (hexMatches) {
              // Filter out common false positives (UUIDs in test IDs, etc.)
              const suspiciousHex = hexMatches.filter((match) => {
                // Only flag if it looks like a pure hex string (no uppercase mixed in)
                return /^[0-9a-f]{7,40}$/.test(match);
              });
              if (suspiciousHex.length > 0) {
                unmount();
                throw new Error(
                  `DOM text content contains hex pattern (possible commit SHA): "${suspiciousHex[0]}"`
                );
              }
            }

            // (d) Does not contain job status literals outside the AppStatusBadge
            const jobStatusLiterals = ["PENDING", "RUNNING", "COMPLETED", "FAILED"];

            // Get the status badge text to exclude it
            const statusBadge = container.querySelector("header");
            const statusBadgeText = statusBadge?.textContent ?? "";

            // Get text content outside the header (where AppStatusBadge lives)
            const mainElement = container.querySelector("main");
            if (mainElement) {
              // Get all sections (regions below the header)
              const sections = mainElement.querySelectorAll("section");
              for (const section of sections) {
                // Skip the header region (first section inside header element)
                if (section.closest("header")) continue;

                const sectionText = section.textContent ?? "";
                for (const literal of jobStatusLiterals) {
                  if (sectionText.includes(literal)) {
                    unmount();
                    throw new Error(
                      `DOM text content outside header contains job status literal: "${literal}" in section`
                    );
                  }
                }
              }
            }

            unmount();
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
