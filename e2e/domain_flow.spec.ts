import { expect, test, type Route } from "@playwright/test";
import { installDashboardMocks } from "./mock-dashboard";

const now = "2026-04-30T12:00:00.000Z";

type MockDomain = {
  id: string;
  domain: string;
  type: "preview" | "custom";
  status: "pending_dns" | "misconfigured" | "connected" | "ssl_pending" | "active" | "failed" | "disabled";
  expectedIp: string | null;
  resolvedIps: string[] | null;
  lastCheckedAt: string | null;
  connectedAt: string | null;
  sslStatus: string | null;
  primary: boolean;
  enabled: boolean;
  createdAt: string;
  errorMessage?: string | null;
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

test("custom domain flow supports add, check, and confirmed removal", async ({ page }) => {
  const domains: MockDomain[] = [
    {
      id: "preview-domain-1",
      domain: "observability-api.apps.sivaps.com",
      type: "preview",
      status: "active",
      expectedIp: "13.201.10.20",
      resolvedIps: ["13.201.10.20"],
      lastCheckedAt: now,
      connectedAt: now,
      sslStatus: "active",
      primary: true,
      enabled: true,
      createdAt: now,
      errorMessage: null,
    },
  ];

  await installDashboardMocks(page);
  await page.route("**/apps/mock-app-1/deploy-gates", (route) => json(route, []));
  await page.route("**/apps/mock-app-1/domains**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method();

    if (pathname === "/apps/mock-app-1/domains" && method === "GET") {
      return json(route, {
        domains,
        primaryDomain: domains.find((domain) => domain.primary)?.domain ?? null,
        previewDomain: domains.find((domain) => domain.type === "preview")?.domain ?? null,
      });
    }

    if (pathname === "/apps/mock-app-1/domains/custom" && method === "POST") {
      const body = JSON.parse(request.postData() || "{}");
      const domain: MockDomain = {
        id: "custom-domain-1",
        domain: body.domain || "myclient.com",
        type: "custom",
        status: "pending_dns",
        expectedIp: "13.201.10.20",
        resolvedIps: null,
        lastCheckedAt: null,
        connectedAt: null,
        sslStatus: null,
        primary: false,
        enabled: true,
        createdAt: now,
        errorMessage: null,
      };
      domains.push(domain);
      return json(route, {
        domain,
        dnsInstructions: {
          type: "A",
          name: "@",
          value: "13.201.10.20",
          ttl: "Auto",
        },
      });
    }

    if (pathname === "/apps/mock-app-1/domains/custom-domain-1/check" && method === "POST") {
      const domain = domains.find((item) => item.id === "custom-domain-1");
      if (domain) {
        domain.status = "connected";
        domain.resolvedIps = ["13.201.10.20"];
        domain.lastCheckedAt = now;
        domain.connectedAt = now;
      }
      return json(route, {
        domain: "myclient.com",
        status: "connected",
        expectedIp: "13.201.10.20",
        resolvedIps: ["13.201.10.20"],
        checkedAt: now,
        message: "DNS is connected",
      });
    }

    if (pathname === "/apps/mock-app-1/domains/custom-domain-1" && method === "DELETE") {
      const index = domains.findIndex((domain) => domain.id === "custom-domain-1");
      if (index >= 0) {
        domains.splice(index, 1);
      }
      return json(route, { success: true });
    }

    return route.fallback();
  });

  await page.goto("/apps/mock-app-1");
  await expect(page.getByRole("heading", { name: /observability api/i })).toBeVisible();

  await page.getByRole("tab", { name: /domains/i }).click();
  const domainsTab = page.getByRole("tabpanel", { name: /domains/i });
  await expect(domainsTab.getByText(/temporary opslin url/i)).toBeVisible();
  await expect(domainsTab.getByRole("link", { name: "https://observability-api.apps.sivaps.com" })).toBeVisible();

  await page.getByRole("button", { name: /add custom domain/i }).click();
  await expect(page.getByRole("dialog", { name: /add custom domain/i })).toBeVisible();
  await page.getByLabel(/your domain/i).fill("myclient.com");
  await page.getByRole("button", { name: /^add domain$/i }).click();

  await expect(domainsTab.getByText(/dns configuration required/i)).toBeVisible();
  await expect(domainsTab.getByText("13.201.10.20").last()).toBeVisible();

  await page.getByRole("button", { name: /check connection/i }).first().click();
  await expect(domainsTab.getByText("DNS is connected. SSL is not ready yet.")).toBeVisible();

  await page.getByRole("button", { name: /open actions for myclient\.com/i }).click();
  await page.getByRole("menuitem", { name: /remove domain/i }).click();
  await expect(page.getByRole("alertdialog", { name: /remove domain/i })).toBeVisible();
  await page.getByRole("alertdialog").getByRole("button", { name: /remove domain/i }).click();

  await expect(page.getByText(/no custom domains connected yet/i)).toBeVisible();
  await expect(page.getByText("myclient.com")).not.toBeVisible();
});
