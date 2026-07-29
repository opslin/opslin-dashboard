import { expect, test } from "@playwright/test";
import { apiBaseUrl } from "./helpers";
import { installDashboardMocks } from "./mock-dashboard";

test("admin dashboard loads investor metrics", async ({ page }) => {
  await installDashboardMocks(page);

  await page.goto("/admin");

  await expect(page.getByTestId("admin-analytics-dashboard")).toBeVisible();
  await expect(page.getByText("Admin analytics")).toBeVisible();
  await expect(page.getByText("Deploy volume")).toBeVisible();
  await expect(page.getByText("MRR")).toBeVisible();
});

test("badge renders in the browser as SVG", async ({ page }) => {
  await installDashboardMocks(page);

  await page.goto(`${apiBaseUrl()}/badge/mock-app-1`);

  await expect(page.locator("svg")).toBeVisible();
  await expect(page.getByText(/Opslin deployed/i)).toBeVisible();
});

test("public status page loads uptime and incidents", async ({ page }) => {
  await installDashboardMocks(page);

  await page.goto("/status/mock-app-1");

  await expect(page.getByTestId("public-status-page")).toBeVisible();
  await expect(page.getByText("Opslin public status")).toBeVisible();
  await expect(page.getByText("99.92%")).toBeVisible();
  await expect(page.getByText("No recent incidents.")).toBeVisible();
});
